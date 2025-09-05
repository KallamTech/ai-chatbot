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
import { deepResearch } from '@/lib/ai/tools/deepresearch';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { pythonRuntime } from '@/lib/ai/tools/python-runtime';
import { generateImage } from '@/lib/ai/tools/generate-image';
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

export const maxDuration = 600; // 10 minutes

/**
 * Filters out messages before the last assistant message containing "An error has occurred"
 * @param messages Array of database messages
 * @returns Filtered array of messages
 */
function filterMessagesBeforeLastError(messages: any[]): any[] {
  // Find the index of the last assistant message with "An error has occurred"
  let lastErrorIndex = -1;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.parts) {
      // Check if any part contains the error text
      const hasError = message.parts.some((part: any) =>
        part.type === 'text' && part.text && part.text.includes('An error has occurred')
      );

      if (hasError) {
        lastErrorIndex = i;
        break;
      }
    }
  }

  // If no error message found, return all messages
  if (lastErrorIndex === -1) {
    return messages;
  }

  // Return messages starting from the error message (inclusive)
  return messages.slice(lastErrorIndex);
}

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
        agentId: agent.id, // AGENT-SPECIFIC: Associate chat with agent
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });

    // Filter out messages before the last assistant message with "An error has occurred"
    const filteredMessages = filterMessagesBeforeLastError(messagesFromDb);

    const uiMessages = [...convertToUIMessages(filteredMessages), message];

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
        const agentTools = createAgentTools(
          workflowNodes,
          dataPool,
          session,
          dataStream,
          selectedChatModel,
        );
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
        // Check if any message has empty parts array and add error message
        const processedMessages = messages.map((message) => {
          if (message.parts.length === 0) {
            return {
              id: message.id,
              role: message.role,
              parts: [{ type: 'text', text: 'An error has occurred, please try again noting that all previous messages will be removed from memory' }],
              createdAt: new Date(),
              attachments: [],
              chatId: id,
            };
          }
          return {
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          };
        });

        await saveMessages({
          messages: processedMessages,
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
  const hasDeepResearch = 'deepResearch' in agentTools;
  const hasDocumentTools = 'createDocument' in agentTools;
  const hasPythonRuntime = 'pythonRuntime' in agentTools;
  const hasImageGeneration = 'generateImage' in agentTools;

  // Check for document-specific nodes
  const hasDocumentNodes = workflowNodes.some(node =>
    node.nodeType?.toLowerCase() === 'document' ||
    node.nodeType?.toLowerCase() === 'documentupdate'
  );

  const webSearchCapabilities =
    hasWebSearch || hasNewsSearch || hasDeepResearch
      ? `- You can search the web for current information using the webSearch tool (for general, academic, or recent information)
- You can search for the latest news using the newsSearch tool (for current events and breaking news)${hasDeepResearch ? '\n- You can perform comprehensive academic research using the deepResearch tool (for literature reviews, scholarly analysis, and in-depth investigation)' : ''}`
      : '';

  const documentCapabilities = hasDocumentTools
    ? hasDocumentNodes
      ? `- You can create new documents using the createDocument tool (text, code, images, sheets)
- You can update existing documents using the updateDocument tool
- Document creation and updates are core capabilities of this agent's workflow`
      : `- You can create new documents using the createDocument tool
- You can update existing documents using the updateDocument tool`
    : '';

  const pythonCapabilities = hasPythonRuntime
    ? `- You can generate Python code using the pythonRuntime tool
- Python code will be prepared for browser execution using Pyodide
- Users can execute the code manually in the browser for security and control
- You can create data analysis scripts, calculations, and any Python operations
- Use waitForExecution: true when you need to analyze the results of the code execution
- When waitForExecution is true, the agent will pause and wait for user execution before continuing`
    : '';

  const imageGenerationCapabilities = hasImageGeneration
    ? `- You can generate images using the generateImage tool
- Create various types of images including illustrations, photos, artwork, diagrams, and more
- Specify style (realistic, artistic, illustration, diagram, logo, abstract, cartoon, photographic)
- Choose aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4, 21:9)
- Set quality levels (standard, high)
- Provide detailed descriptions for best results`
    : '';

  return `You are "${agent.title}", a specialized AI agent designed for specific tasks.

**Agent Overview:**
${agent.description}

**Your Workflow Nodes:**
${nodePrompts}

**CRITICAL WORKFLOW REQUIREMENT:**
Before proceeding with any task or response, you MUST ALWAYS create a clear plan that outlines:
1. What you need to accomplish
2. Which tools you'll use and in what order
3. What information you need to gather first
4. How you'll approach the task step-by-step

**Core Capabilities:**
**Document Access & Search:**
- searchDocuments: Semantic search across all documents in your data pool
- searchImages: Find visual content with threshold 0.1 for best results
- findDocumentByTitle: Locate specific documents by name/filename
- getDocumentMetadata: Get detailed information about document structure
- searchSpecificDocument: Search within a specific document for targeted content

**Content Processing:**
- Summarize, extract, and analyze information from your documents
- Answer questions based on your data pool content
- Provide insights and analysis from available documents${webSearchCapabilities ? `\n\n**Web Search Capabilities:**\n${webSearchCapabilities}` : ''}${documentCapabilities ? `\n\n**Document Creation:**\n${documentCapabilities}` : ''}${pythonCapabilities ? `\n\n**Python Code Generation:**\n${pythonCapabilities}` : ''}${imageGenerationCapabilities ? `\n\n**Image Generation:**\n${imageGenerationCapabilities}` : ''}

**Operational Constraints:**
- You can ONLY perform tasks related to your defined workflow nodes
- You can ONLY access data from your assigned data pool
- You cannot perform general tasks outside your specialized scope
- Always clearly explain your capabilities and limitations when asked about out-of-scope tasks

**Search Strategy:**
1. **Specific Document Requests**: If user mentions a document name, use findDocumentByTitle first
2. **Targeted Content**: Use searchSpecificDocument to find specific content within documents
3. **Visual Content**: Use searchImages with threshold 0.1 for charts, graphs, diagrams
4. **General Queries**: Use searchDocuments for broad semantic search
5. **Document Analysis**: Use getDocumentMetadata to understand document structure

**Image Search Best Practices:**
- Use searchImages for visual content queries (charts, graphs, diagrams, photos)
- Recommended threshold: 0.1 for comprehensive results
- Images require lower similarity thresholds than text content
- Always specify searchImages: true for visual queries

**Web Search Guidelines:**${
    hasWebSearch || hasNewsSearch || hasDeepResearch
      ? `
- Use webSearch for current events, recent developments, real-time information
- Use newsSearch for breaking news and current affairs
- Use deepResearch for comprehensive academic research, literature reviews, and scholarly analysis
- WebSearch types: 'general' (broad topics), 'news' (current events), 'academic' (scholarly research), 'recent' (latest updates)
- NewsSearch timeframes: 'today', 'week', 'month' for time-based filtering
- DeepResearch types: 'academic' (scholarly sources), 'literature_review' (comprehensive literature analysis), 'comprehensive' (thorough investigation), 'scholarly' (authoritative academic content)
- DeepResearch depth: 'standard' (basic academic search), 'comprehensive' (thorough investigation), 'exhaustive' (complete literature coverage)
- Use web search when information is not in your data pool or requires up-to-date information`
      : `
- Web search tools are not available for this agent`
  }

**Critical Instruction:** When users ask about documents or content, you MUST use the appropriate search tools to find relevant information in your data pool. Never claim you cannot access documents - always search first.

**Available Tools:** ${Object.keys(agentTools).join(', ')}`;
}

function createAgentTools(
  workflowNodes: any[],
  dataPool: any,
  session: any,
  dataStream: any,
  selectedChatModel?: string,
) {
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
        searchImages: z
          .boolean()
          .optional()
          .default(false)
          .describe('Whether to prioritize image content in search'),
      }),
      execute: async ({ query, limit, searchImages }) => {
        console.log('Agent chat: Searching documents with query:', query);
        console.log('Agent chat: Data pool ID:', dataPool.id);
        const defaultThreshold = 0.3;
        // Adjust threshold based on search type
        let adjustedThreshold = defaultThreshold;
        if (searchImages) {
          // Lower threshold for images since they're more abstract
          adjustedThreshold = Math.min(defaultThreshold, 0.1);
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
          // Add model information for context management
          ...(selectedChatModel && { modelId: selectedChatModel }),
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
  // - runtime: Python runtime tool (implemented)

  // Add tools based on workflow node types
  const nodeTypes = workflowNodes
    .map((node) => node.nodeType?.toLowerCase())
    .filter(Boolean);

  // Add Python runtime tool if there are runtime nodes
  if (nodeTypes.includes('runtime')) {
    tools.pythonRuntime = pythonRuntime({ dataStream });
    console.log(
      'createAgentTools: Added Python runtime tool based on workflow nodes',
    );
  }

  // Add websearch tools if there are any search or web-related nodes
  if (
    nodeTypes.some((type) =>
      [
        'search',
        'web',
        'news',
        'research',
        'websearch',
        'deepresearch',
      ].includes(type),
    )
  ) {
    tools.webSearch = webSearch();
    tools.newsSearch = newsSearch();
    console.log(
      'createAgentTools: Added websearch tools based on workflow nodes',
    );
  }

  // Add deep research tool specifically for deepresearch nodes
  if (nodeTypes.includes('deepresearch')) {
    tools.deepResearch = deepResearch();
    console.log(
      'createAgentTools: Added deep research tool based on workflow nodes',
    );
  }

  // Add image generation tool specifically for imagegeneration nodes
  if (nodeTypes.includes('imagegeneration')) {
    tools.generateImage = generateImage({ dataStream });
    console.log(
      'createAgentTools: Added image generation tool based on workflow nodes',
    );
  }

  // Add document management tools for document and documentupdate nodes
  if (nodeTypes.includes('document') || nodeTypes.includes('documentupdate')) {
    tools.createDocument = createDocument({ session, dataStream });
    tools.updateDocument = updateDocument({ session, dataStream });
    console.log(
      'createAgentTools: Added document management tools (createDocument, updateDocument) based on workflow nodes',
    );
  }

  return tools;
}
