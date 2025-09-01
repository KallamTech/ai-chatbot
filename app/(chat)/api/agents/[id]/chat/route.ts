import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { z } from 'zod';
import { auth, type UserType } from '@/app/(auth)/auth';
import { myProvider } from '@/lib/ai/providers';
import {
  createStreamId,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  getAgentById,
  getWorkflowNodesByAgentId,
  getDataPoolByAgentId,
  getDataPoolDocuments,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { ragSearch } from '@/lib/ai/tools/rag-search';
import { webSearch, newsSearch } from '@/lib/ai/tools/websearch';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { isProductionEnvironment } from '@/lib/constants';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import {
  postRequestBodySchema,
  type PostRequestBody,
} from '@/app/(chat)/api/chat/schema';
//import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';
import type { ChatModel } from '@/lib/ai/models';
import type { VisibilityType } from '@/components/visibility-selector';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: agentId } = await params;
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const userType: UserType = session.user.type;

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    if (messageCount > entitlementsByUserType[userType].maxMessagesPerDay) {
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    // AGENT-SPECIFIC: Verify agent exists and belongs to user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // AGENT-SPECIFIC: Get agent's workflow nodes and data pool
    const [workflowNodes, dataPool] = await Promise.all([
      getWorkflowNodesByAgentId({ agentId }),
      getDataPoolByAgentId({ agentId }),
    ]);

    console.log('Agent chat: Workflow nodes found:', workflowNodes.length);
    console.log('Agent chat: Data pool found:', !!dataPool);
    if (dataPool) {
      console.log('Agent chat: Data pool ID:', dataPool.id);
      console.log('Agent chat: Data pool name:', dataPool.name);
    }

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title: `${agent.title}: ${title}`, // AGENT-SPECIFIC: Add agent name to title
        visibility: selectedVisibilityType,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

    //const { longitude, latitude, city, country } = geolocation(request);

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        // AGENT-SPECIFIC: Create agent system prompt and tools
        const agentTools = createAgentTools(workflowNodes, dataPool, session, dataStream);
        const agentSystemPrompt = createAgentSystemPrompt(
          agent,
          workflowNodes,
          agentTools,
        );

        console.log('Agent chat: Created tools:', Object.keys(agentTools));
        console.log('Agent chat: Data pool exists:', !!dataPool);
        console.log('Agent chat: Data pool ID:', dataPool?.id);

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: agentSystemPrompt, // AGENT-SPECIFIC: Use agent system prompt
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools: Object.keys(agentTools), // AGENT-SPECIFIC: Use agent tools
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: agentTools, // AGENT-SPECIFIC: Use agent tools
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text-agent',
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        await saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });
      },
      onError: () => {
        return 'Oops, an error occurred while chatting with the agent!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    } else {
      return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    console.error('Unexpected error in agent chat:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// AGENT-SPECIFIC FUNCTIONS
function createAgentSystemPrompt(
  agent: any,
  workflowNodes: any[],
  agentTools: any,
): string {
  const nodePrompts = workflowNodes
    .map((node) => `- ${node.name}: ${node.systemPrompt}`)
    .join('\n');

  // Check which tools are available
  const hasWebSearch = 'webSearch' in agentTools;
  const hasNewsSearch = 'newsSearch' in agentTools;
  const hasDocumentTools = 'createDocument' in agentTools;

  const webSearchCapabilities = hasWebSearch || hasNewsSearch
    ? `- You can search the web for current information using the webSearch tool (for general, academic, or recent information)
- You can search for the latest news using the newsSearch tool (for current events and breaking news)`
    : '';

  const documentCapabilities = hasDocumentTools
    ? `- You can create new documents using the createDocument tool
- You can update existing documents using the updateDocument tool`
    : '';

  return `You are "${agent.title}", an AI agent with specific capabilities.

Agent Description: ${agent.description}

Your workflow consists of the following specialized nodes:
${nodePrompts}

IMPORTANT CAPABILITIES:
- You can search through documents in your data pool using the searchDocuments tool
- You can search specifically for images using the searchImages tool (recommended threshold: 0.1)
- You can find specific documents by title/filename using the findDocumentByTitle tool
- You can get detailed metadata about documents using the getDocumentMetadata tool
- You can search within specific documents using the searchSpecificDocument tool
- You can access and analyze any documents that have been uploaded to your data pool
- You can summarize, extract information, and answer questions about your documents${webSearchCapabilities ? '\n' + webSearchCapabilities : ''}${documentCapabilities ? '\n' + documentCapabilities : ''}

IMPORTANT CONSTRAINTS:
- You can ONLY perform tasks related to your defined workflow nodes
- You can ONLY access data from your assigned data pool
- You cannot perform general tasks outside your scope
- Always explain your capabilities and limitations when asked about tasks outside your scope

DOCUMENT SEARCH STRATEGY:
1. If the user mentions a specific document name (e.g., "Summarize doc1", "Analyze report.pdf"), use findDocumentByTitle first to locate it
2. If you find the document, use searchSpecificDocument to search within it for the requested content
3. If the user asks for images or visual content, use searchImages with threshold 0.1 for best results
4. If no specific document is mentioned, use searchDocuments for general semantic search
5. Use getDocumentMetadata to understand document structure and properties

IMAGE SEARCH GUIDELINES:
- Use searchImages tool for visual content queries
- Recommended threshold: 0.1 for comprehensive image results
- Images are more abstract, so lower thresholds work better than text
- Always specify searchImages: true when looking for charts, graphs, diagrams, or visual content

WEB SEARCH GUIDELINES:${hasWebSearch || hasNewsSearch ? `
- Use webSearch tool when users ask for current events, recent developments, or real-time information
- Use newsSearch tool specifically for breaking news and current affairs
- Choose search type: 'general' for broad topics, 'news' for current events, 'academic' for research, 'recent' for latest updates
- Always use websearch when the information needed is not in your data pool or requires up-to-date information` : `
- Web search tools are not available for this agent`}

CRITICAL INSTRUCTION: When a user asks about documents or content, you MUST use the appropriate search tools to find relevant information in your data pool. Do not say you cannot access documents - use the search tools first.

Available tools: ${Object.keys(agentTools).join(', ')}`;
}

function createAgentTools(workflowNodes: any[], dataPool: any, session: any, dataStream: any) {
  const tools: any = {};

  console.log('createAgentTools: Creating tools for data pool:', !!dataPool);
  if (dataPool) {
    console.log('createAgentTools: Data pool ID:', dataPool.id);

    // Always provide document search if there's a data pool (regardless of workflow nodes)
    // Create a bound RAG search tool with the specific data pool ID
    tools.searchDocuments = tool({
      description:
        'Search through documents in your data pool using semantic similarity',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        limit: z
          .number()
          .optional()
          .default(10)
          .describe('Maximum number of results to return'),
        threshold: z
          .number()
          .optional()
          .default(0.3)
          .describe('Minimum similarity threshold (0.5 for balanced results)'),
        searchImages: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to prioritize image content in search'),
      }),
      execute: async ({ query, limit, threshold, searchImages }) => {
        console.log('Agent chat: Searching documents with query:', query);
        console.log('Agent chat: Data pool ID:', dataPool.id);

        // Adjust threshold based on search type
        let adjustedThreshold = threshold;
        if (searchImages) {
          // Lower threshold for images since they're more abstract
          adjustedThreshold = Math.min(threshold, 0.1);
          console.log(
            'Agent chat: Image search detected, adjusted threshold to:',
            adjustedThreshold,
          );
        }

        // Use the ragSearch tool but bind it to this specific data pool
        const ragSearchTool = ragSearch();
        const result = await (ragSearchTool as any).execute({
          dataPoolId: dataPool.id,
          query,
          limit,
          threshold: adjustedThreshold,
          // Add image-specific filtering if requested
          ...(searchImages && { documentType: 'extracted_image' }),
        });

        console.log('Agent chat: Search result:', result);
        return result;
      },
    });

    // Add tool for finding documents by title/filename
    tools.findDocumentByTitle = tool({
      description:
        'Find a specific document by its title, filename, or partial name match',
      inputSchema: z.object({
        title: z
          .string()
          .describe('Document title, filename, or partial name to search for'),
        exactMatch: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            'Whether to require an exact match or allow partial matches',
          ),
      }),
      execute: async ({ title, exactMatch }) => {
        console.log('Agent chat: Finding document by title:', title);

        try {
          // Get documents directly from database
          const documents = await getDataPoolDocuments({
            dataPoolId: dataPool.id,
          });

          // Search through documents
          const matches = documents.filter((doc: any) => {
            const searchTitle = title.toLowerCase();
            const docTitle = doc.title.toLowerCase();
            const fileName = doc.metadata?.fileName?.toLowerCase() || '';
            const searchTags = doc.metadata?.searchTags || [];

            if (exactMatch) {
              return docTitle === searchTitle || fileName === searchTitle;
            } else {
              return (
                docTitle.includes(searchTitle) ||
                fileName.includes(searchTitle) ||
                searchTags.some((tag: string) => tag.includes(searchTitle))
              );
            }
          });

          if (matches.length === 0) {
            return {
              found: false,
              message: `No documents found matching "${title}"`,
              suggestions: documents.map((doc: any) => doc.title).slice(0, 5),
            };
          }

          return {
            found: true,
            count: matches.length,
            documents: matches.map((doc: any) => ({
              id: doc.id,
              title: doc.title,
              metadata: doc.metadata,
              createdAt: doc.createdAt,
            })),
          };
        } catch (error) {
          console.error('Error finding document by title:', error);
          return {
            found: false,
            error: 'Failed to search documents',
          };
        }
      },
    });

    // Add tool for getting document metadata
    tools.getDocumentMetadata = tool({
      description:
        'Get detailed metadata and information about a specific document',
      inputSchema: z.object({
        documentId: z
          .string()
          .describe('ID of the document to get metadata for'),
      }),
      execute: async ({ documentId }) => {
        console.log('Agent chat: Getting metadata for document:', documentId);

        try {
          // Get documents directly from database
          const documents = await getDataPoolDocuments({
            dataPoolId: dataPool.id,
          });
          const document = documents.find((doc: any) => doc.id === documentId);

          if (!document) {
            return {
              found: false,
              message: `Document with ID ${documentId} not found`,
            };
          }

          return {
            found: true,
            document: {
              id: document.id,
              title: document.title,
              metadata: document.metadata,
              createdAt: document.createdAt,
            },
          };
        } catch (error) {
          console.error('Error getting document metadata:', error);
          return {
            found: false,
            error: 'Failed to get document metadata',
          };
        }
      },
    });

    // Add tool for targeted document search
    tools.searchSpecificDocument = tool({
      description:
        'Search within a specific document by ID, useful when you know which document to analyze',
      inputSchema: z.object({
        documentId: z
          .string()
          .describe('ID of the specific document to search within'),
        query: z
          .string()
          .describe(
            'Search query to find specific content within the document',
          ),
      }),
      execute: async ({ documentId, query }) => {
        console.log(
          'Agent chat: Searching within specific document:',
          documentId,
          'query:',
          query,
        );

        try {
          // First get the document metadata directly from database
          const documents = await getDataPoolDocuments({
            dataPoolId: dataPool.id,
          });
          const document = documents.find((doc: any) => doc.id === documentId);

          if (!document) {
            return {
              found: false,
              message: `Document with ID ${documentId} not found`,
            };
          }

          // Now search within this specific document using RAG with metadata filtering
          const ragSearchTool = ragSearch();
          const result = await (ragSearchTool as any).execute({
            dataPoolId: dataPool.id,
            query: `${query} [document: ${document.title}]`,
            limit: 3,
            threshold: 0.2, // Lower threshold for specific document search
            documentType: (document.metadata as any)?.documentType, // Filter by document type
            fileName: (document.metadata as any)?.fileName, // Filter by filename
            tags: (document.metadata as any)?.searchTags, // Filter by search tags
          });

          return {
            found: true,
            document: {
              id: document.id,
              title: document.title,
              metadata: document.metadata,
            },
            searchResults: result,
          };
        } catch (error) {
          console.error('Error searching specific document:', error);
          return {
            found: false,
            error: 'Failed to search within document',
          };
        }
      },
    });

    // Add dedicated image search tool with appropriate thresholds
    tools.searchImages = tool({
      description:
        'Search specifically for images and visual content in your data pool',
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            'Search query for images (e.g., "charts", "graphs", "diagrams")',
          ),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe('Maximum number of image results to return'),
        threshold: z
          .number()
          .optional()
          .default(0.1)
          .describe('Similarity threshold (0.1 recommended for images)'),
      }),
      execute: async ({ query, limit, threshold }) => {
        console.log('Agent chat: Searching for images with query:', query);

        try {
          const ragSearchTool = ragSearch();
          const result = await (ragSearchTool as any).execute({
            dataPoolId: dataPool.id,
            query,
            limit,
            threshold: Math.max(threshold, 0.1), // Ensure minimum threshold for images
            documentType: 'extracted_image', // Only search image documents
          });

          return {
            ...result,
            searchType: 'image_search',
            recommendedThreshold: '0.1 for comprehensive image results',
          };
        } catch (error) {
          console.error('Error searching images:', error);
          return {
            error: 'Failed to search images',
            searchType: 'image_search',
          };
        }
      },
    });

    console.log(
      'createAgentTools: Created searchDocuments and searchImages tools',
    );
  } else {
    console.log(
      'createAgentTools: No data pool found, cannot create search tools',
    );
  }

  // TODO: Add more tools based on other node types:
  // - transform: text processing tools
  // - filter: data filtering tools
  // - aggregate: data aggregation tools

  // Add tools based on workflow node types
  const nodeTypes = workflowNodes.map(node => node.nodeType?.toLowerCase()).filter(Boolean);

  // Add websearch tools if there are any search or web-related nodes
  if (nodeTypes.some(type => ['search', 'web', 'news', 'research'].includes(type))) {
    tools.webSearch = webSearch();
    tools.newsSearch = newsSearch();
    console.log('createAgentTools: Added websearch tools based on workflow nodes');
  }

  // Add document management tools (always available for agents like main chat)
  tools.createDocument = createDocument({ session, dataStream });
  tools.updateDocument = updateDocument({ session, dataStream });

  console.log('createAgentTools: Added document management tools (createDocument, updateDocument)');

  return tools;
}
