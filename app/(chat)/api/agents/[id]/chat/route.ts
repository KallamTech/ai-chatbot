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
  getDataPoolsByAgentId,
  searchDataPoolDocumentsByTitle,
  getDataPoolDocumentTitles,
  getDocumentById,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { ragSearch } from '@/lib/ai/tools/rag-search';
import { directFetch } from '@/lib/ai/tools/direct-fetch';
import { webSearch, newsSearch } from '@/lib/ai/tools/websearch';
import { deepResearch } from '@/lib/ai/tools/deepresearch';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { pythonRuntime } from '@/lib/ai/tools/python-runtime';
import { generateImage } from '@/lib/ai/tools/generate-image';
import { isProductionEnvironment } from '@/lib/constants';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import {
  postRequestBodySchemaAuthenticated,
  type PostRequestBodyAuthenticated,
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
      const hasError = message.parts.some(
        (part: any) =>
          part.type === 'text' &&
          part.text &&
          part.text.includes('An error has occurred'),
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
  let requestBody: PostRequestBodyAuthenticated;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchemaAuthenticated.parse(json);
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

    // AGENT-SPECIFIC: Get agent's workflow nodes and data pools
    const [workflowNodes, dataPools] = await Promise.all([
      getWorkflowNodesByAgentId({ agentId }),
      getDataPoolsByAgentId({ agentId }),
    ]);

    console.log('Agent chat: Workflow nodes found:', workflowNodes.length);
    console.log('Agent chat: Data pools found:', dataPools.length);
    if (dataPools.length > 0) {
      console.log(
        'Agent chat: Data pool IDs:',
        dataPools.map((dp) => dp.id),
      );
      console.log(
        'Agent chat: Data pool names:',
        dataPools.map((dp) => dp.name),
      );
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
          dataPools,
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
        console.log('Agent chat: Data pools available:', dataPools.length);
        console.log(
          'Agent chat: Data pool IDs:',
          dataPools.map((dp) => dp.id),
        );

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
              parts: [
                {
                  type: 'text',
                  text: 'An error has occurred, please try again noting that all previous messages will be removed from memory',
                },
              ],
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
  const hasDocumentNodes = workflowNodes.some(
    (node) =>
      node.nodeType?.toLowerCase() === 'document' ||
      node.nodeType?.toLowerCase() === 'documentupdate',
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
- searchDocuments: Semantic search across all documents in your connected data pools
- searchImages: Find visual content with threshold 0.1 for best results across all data pools
- findDocumentByTitle: Locate specific documents by name/filename across all data pools
- getDocumentMetadata: Get detailed information about document structure
- searchSpecificDocument: Search within a specific document for targeted content

**Content Processing:**
- Summarize, extract, and analyze information from your documents across all connected data pools
- Answer questions based on your data pool content from all connected sources
- Provide insights and analysis from available documents${webSearchCapabilities ? `\n\n**Web Search Capabilities:**\n${webSearchCapabilities}` : ''}${documentCapabilities ? `\n\n**Document Creation:**\n${documentCapabilities}` : ''}${pythonCapabilities ? `\n\n**Python Code Generation:**\n${pythonCapabilities}` : ''}${imageGenerationCapabilities ? `\n\n**Image Generation:**\n${imageGenerationCapabilities}` : ''}

**Operational Constraints:**
- You can ONLY perform tasks related to your defined workflow nodes
- You can ONLY access data from your assigned data pools (you may have access to multiple data pools)
- You cannot perform general tasks outside your specialized scope
- Always clearly explain your capabilities and limitations when asked about out-of-scope tasks

**Search Strategy:**
1. **Specific Document Requests**: If user mentions a document name, use findDocumentByTitle first (searches across all data pools)
2. **Targeted Content**: Use searchSpecificDocument to find specific content within documents
3. **Visual Content**: Use searchImages with threshold 0.1 for charts, graphs, diagrams (searches across all data pools)
4. **General Queries**: Use searchDocuments for broad semantic search (searches across all data pools)
5. **Document Analysis**: Use getDocumentMetadata to understand document structure
6. **Data Pool Specific**: Use the optional dataPoolId parameter to search within a specific data pool if needed

**Image Search Best Practices:**
- Use searchImages for visual content queries (charts, graphs, diagrams, photos)
- Recommended threshold: 0.1 for comprehensive results
- Images require lower similarity thresholds than text content
- Always specify searchImages: true for visual queries
- Search results will include which data pool each image was found in

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
  dataPools: any[],
  session: any,
  dataStream: any,
  selectedChatModel?: string,
) {
  const tools: any = {};

  console.log(
    'createAgentTools: Creating tools for data pools:',
    dataPools.length,
  );
  if (dataPools.length > 0) {
    console.log(
      'createAgentTools: Data pool IDs:',
      dataPools.map((dp) => dp.id),
    );

    // Always provide document search if there are data pools (regardless of workflow nodes)
    // Create a bound RAG search tool that searches across all connected data pools
    tools.searchDocuments = tool({
      description:
        'Search through documents in all your connected data pools using semantic similarity',
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
        title: z
          .string()
          .optional()
          .describe('Filter by document title (partial match)'),
        dataPoolId: z
          .string()
          .optional()
          .describe('Optional: Search in a specific data pool by ID'),
      }),
      execute: async ({ query, limit, searchImages, title, dataPoolId }) => {
        console.log('Agent chat: Searching documents with query:', query);
        console.log('Agent chat: Available data pools:', dataPools.length);

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

        // If a specific data pool is requested, search only that one
        if (dataPoolId) {
          const targetDataPool = dataPools.find((dp) => dp.id === dataPoolId);
          if (!targetDataPool) {
            return {
              error: `Data pool with ID ${dataPoolId} not found in connected data pools`,
              availableDataPools: dataPools.map((dp) => ({
                id: dp.id,
                name: dp.name,
              })),
            };
          }

          const ragSearchTool = ragSearch();
          const result = await (ragSearchTool as any).execute({
            dataPoolId: targetDataPool.id,
            query,
            limit,
            threshold: adjustedThreshold,
            ...(title && { title }),
            ...(selectedChatModel && { modelId: selectedChatModel }),
          });

          console.log(
            'Agent chat: Search result for specific data pool:',
            result,
          );
          return {
            ...result,
            searchedDataPool: {
              id: targetDataPool.id,
              name: targetDataPool.name,
            },
          };
        }

        // Search across all data pools and combine results
        const ragSearchTool = ragSearch();
        const searchPromises = dataPools.map(async (dataPool) => {
          try {
            const result = await (ragSearchTool as any).execute({
              dataPoolId: dataPool.id,
              query,
              limit: Math.ceil(limit / dataPools.length), // Distribute limit across pools
              threshold: adjustedThreshold,
              ...(title && { title }),
              ...(selectedChatModel && { modelId: selectedChatModel }),
            });

            return {
              dataPool: { id: dataPool.id, name: dataPool.name },
              results: result,
            };
          } catch (error) {
            console.error(`Error searching data pool ${dataPool.id}:`, error);
            return {
              dataPool: { id: dataPool.id, name: dataPool.name },
              error: 'Search failed for this data pool',
            };
          }
        });

        const searchResults = await Promise.all(searchPromises);

        // Combine results from all data pools
        const combinedResults = {
          query,
          totalResults: 0,
          dataPools: searchResults,
          searchedDataPools: dataPools.map((dp) => ({
            id: dp.id,
            name: dp.name,
          })),
        };

        // Count total results
        searchResults.forEach((result) => {
          if (result.results && result.results.results) {
            combinedResults.totalResults += result.results.results.length;
          }
        });

        console.log('Agent chat: Combined search results:', combinedResults);
        return combinedResults;
      },
    });

    // Add direct SQL-backed fetch tool for high-level retrieval by title/filename
    tools.directFetch = tool({
      description:
        'Fetch documents directly from connected data pools using SQL filters on title and metadata.fileName. Ideal for tasks like summarizing a specific PDF by name.',
      inputSchema: z.object({
        dataPoolId: z
          .string()
          .describe(
            `ID of the data pool. Available: ${dataPools.map((dp: any) => `${dp.id} (${dp.name})`).join(', ')}`,
          ),
        title: z.string().optional(),
        fileName: z.string().optional(),
        limit: z.number().optional().default(20),
        offset: z.number().optional().default(0),
        includeContent: z.boolean().optional().default(true),
      }),
      execute: async ({
        dataPoolId,
        title,
        fileName,
        limit = 20,
        offset = 0,
        includeContent = true,
      }) => {
        const targetDataPool = dataPools.find(
          (dp: any) => dp.id === dataPoolId,
        );
        if (!targetDataPool) {
          return {
            error: `Data pool with ID ${dataPoolId} not found in connected data pools`,
            availableDataPools: dataPools.map((dp: any) => ({
              id: dp.id,
              name: dp.name,
            })),
          };
        }

        const dfFetchTool = directFetch();
        const result = await (dpFetchTool as any).execute({
          dataPoolId: targetDataPool.id,
          title,
          fileName,
          limit,
          offset,
          includeContent,
        });

        return {
          ...result,
          searchedDataPool: {
            id: targetDataPool.id,
            name: targetDataPool.name,
          },
        };
      },
    });

    // Add tool for finding documents by title/filename across all data pools
    tools.findDocumentByTitle = tool({
      description:
        'Find a specific document by its title, filename, or partial name match across all connected data pools',
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
        dataPoolId: z
          .string()
          .optional()
          .describe('Optional: Search in a specific data pool by ID'),
      }),
      execute: async ({ title, exactMatch, dataPoolId }) => {
        console.log('Agent chat: Finding document by title:', title);

        try {
          // If a specific data pool is requested, search only that one
          if (dataPoolId) {
            const targetDataPool = dataPools.find((dp) => dp.id === dataPoolId);
            if (!targetDataPool) {
              return {
                found: false,
                error: `Data pool with ID ${dataPoolId} not found in connected data pools`,
                availableDataPools: dataPools.map((dp) => ({
                  id: dp.id,
                  name: dp.name,
                })),
              };
            }

            const matches = await searchDataPoolDocumentsByTitle({
              dataPoolId: targetDataPool.id,
              title,
              exactMatch,
              limit: 50,
            });

            if (matches.length === 0) {
              const suggestions = await getDataPoolDocumentTitles({
                dataPoolId: targetDataPool.id,
                limit: 5,
              });

              return {
                found: false,
                message: `No documents found matching "${title}" in data pool "${targetDataPool.name}"`,
                suggestions,
                searchedDataPool: {
                  id: targetDataPool.id,
                  name: targetDataPool.name,
                },
              };
            }

            return {
              found: true,
              count: matches.length,
              documents: matches.map((doc) => ({
                id: doc.id,
                title: doc.title,
                metadata: doc.metadata,
                createdAt: doc.createdAt,
              })),
              searchedDataPool: {
                id: targetDataPool.id,
                name: targetDataPool.name,
              },
            };
          }

          // Search across all data pools
          const searchPromises = dataPools.map(async (dataPool) => {
            try {
              const matches = await searchDataPoolDocumentsByTitle({
                dataPoolId: dataPool.id,
                title,
                exactMatch,
                limit: 50,
              });

              return {
                dataPool: { id: dataPool.id, name: dataPool.name },
                matches,
                count: matches.length,
              };
            } catch (error) {
              console.error(`Error searching data pool ${dataPool.id}:`, error);
              return {
                dataPool: { id: dataPool.id, name: dataPool.name },
                error: 'Search failed for this data pool',
                matches: [],
                count: 0,
              };
            }
          });

          const searchResults = await Promise.all(searchPromises);

          // Combine all matches
          const allMatches = searchResults.flatMap((result) =>
            result.matches.map((doc) => ({
              ...doc,
              dataPool: result.dataPool,
            })),
          );

          if (allMatches.length === 0) {
            // Get suggestions from all data pools
            const suggestionPromises = dataPools.map(async (dataPool) => {
              try {
                const suggestions = await getDataPoolDocumentTitles({
                  dataPoolId: dataPool.id,
                  limit: 3,
                });
                return {
                  dataPool: { id: dataPool.id, name: dataPool.name },
                  suggestions,
                };
              } catch (error) {
                return {
                  dataPool: { id: dataPool.id, name: dataPool.name },
                  suggestions: [],
                };
              }
            });

            const allSuggestions = await Promise.all(suggestionPromises);

            return {
              found: false,
              message: `No documents found matching "${title}" across all connected data pools`,
              suggestions: allSuggestions,
              searchedDataPools: dataPools.map((dp) => ({
                id: dp.id,
                name: dp.name,
              })),
            };
          }

          return {
            found: true,
            count: allMatches.length,
            documents: allMatches.map((doc) => ({
              id: doc.id,
              title: doc.title,
              metadata: doc.metadata,
              createdAt: doc.createdAt,
              dataPool: doc.dataPool,
            })),
            searchedDataPools: dataPools.map((dp) => ({
              id: dp.id,
              name: dp.name,
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
          // Get document directly by ID from database
          const document = await getDocumentById({ id: documentId });

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
              content: document.content,
              kind: document.kind,
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

    // Add tool for targeted document search across all data pools
    tools.searchSpecificDocument = tool({
      description:
        'Search within a specific document by ID across all connected data pools, useful when you know which document to analyze',
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
          // Search for the document across all connected data pools
          let foundDocument = null;
          let documentDataPool = null;

          // Search through all data pools to find the document
          for (const dataPool of dataPools) {
            try {
              // Use the ragSearch tool to find the document by ID
              const ragSearchTool = ragSearch();
              const searchResult = await (ragSearchTool as any).execute({
                dataPoolId: dataPool.id,
                query: `document id: ${documentId}`,
                limit: 1,
                threshold: 0.1, // Very low threshold to find exact document
              });

              if (
                searchResult &&
                searchResult.results &&
                searchResult.results.length > 0
              ) {
                // Check if any result matches the document ID
                const matchingResult = searchResult.results.find(
                  (result: any) =>
                    result.metadata && result.metadata.id === documentId,
                );

                if (matchingResult) {
                  foundDocument = {
                    id: documentId,
                    title: matchingResult.metadata.title || 'Unknown Document',
                  };
                  documentDataPool = dataPool;
                  break;
                }
              }
            } catch (error) {
              console.error(
                `Error searching for document in data pool ${dataPool.id}:`,
                error,
              );
              // Continue searching in other data pools
            }
          }

          if (!foundDocument || !documentDataPool) {
            return {
              found: false,
              message: `Document with ID ${documentId} not found in any connected data pools`,
              availableDataPools: dataPools.map((dp) => ({
                id: dp.id,
                name: dp.name,
              })),
            };
          }

          // Now search within this specific document using RAG
          const ragSearchTool = ragSearch();
          const result = await (ragSearchTool as any).execute({
            dataPoolId: documentDataPool.id,
            query: `${query} [document: ${foundDocument.title}]`,
            limit: 3,
            threshold: 0.2, // Lower threshold for specific document search
            title: foundDocument.title, // Filter by specific document title
          });

          return {
            found: true,
            document: {
              id: foundDocument.id,
              title: foundDocument.title,
            },
            dataPool: { id: documentDataPool.id, name: documentDataPool.name },
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

    // Add dedicated image search tool with appropriate thresholds across all data pools
    tools.searchImages = tool({
      description:
        'Search specifically for images and visual content across all your connected data pools',
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
        dataPoolId: z
          .string()
          .optional()
          .describe('Optional: Search in a specific data pool by ID'),
      }),
      execute: async ({ query, limit, threshold, dataPoolId }) => {
        console.log('Agent chat: Searching for images with query:', query);

        try {
          // If a specific data pool is requested, search only that one
          if (dataPoolId) {
            const targetDataPool = dataPools.find((dp) => dp.id === dataPoolId);
            if (!targetDataPool) {
              return {
                error: `Data pool with ID ${dataPoolId} not found in connected data pools`,
                availableDataPools: dataPools.map((dp) => ({
                  id: dp.id,
                  name: dp.name,
                })),
                searchType: 'image_search',
              };
            }

            const ragSearchTool = ragSearch();
            const result = await (ragSearchTool as any).execute({
              dataPoolId: targetDataPool.id,
              query,
              limit,
              threshold: Math.max(threshold, 0.1), // Ensure minimum threshold for images
              documentType: 'extracted_image', // Only search image documents
            });

            return {
              ...result,
              searchType: 'image_search',
              recommendedThreshold: '0.1 for comprehensive image results',
              searchedDataPool: {
                id: targetDataPool.id,
                name: targetDataPool.name,
              },
            };
          }

          // Search across all data pools for images
          const ragSearchTool = ragSearch();
          const searchPromises = dataPools.map(async (dataPool) => {
            try {
              const result = await (ragSearchTool as any).execute({
                dataPoolId: dataPool.id,
                query,
                limit: Math.ceil(limit / dataPools.length), // Distribute limit across pools
                threshold: Math.max(threshold, 0.1), // Ensure minimum threshold for images
                documentType: 'extracted_image', // Only search image documents
              });

              return {
                dataPool: { id: dataPool.id, name: dataPool.name },
                results: result,
              };
            } catch (error) {
              console.error(
                `Error searching images in data pool ${dataPool.id}:`,
                error,
              );
              return {
                dataPool: { id: dataPool.id, name: dataPool.name },
                error: 'Image search failed for this data pool',
              };
            }
          });

          const searchResults = await Promise.all(searchPromises);

          // Combine results from all data pools
          const combinedResults = {
            query,
            totalResults: 0,
            dataPools: searchResults,
            searchedDataPools: dataPools.map((dp) => ({
              id: dp.id,
              name: dp.name,
            })),
            searchType: 'image_search',
            recommendedThreshold: '0.1 for comprehensive image results',
          };

          // Count total results
          searchResults.forEach((result) => {
            if (result.results && result.results.results) {
              combinedResults.totalResults += result.results.results.length;
            }
          });

          return combinedResults;
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
      'createAgentTools: Created search tools for multiple data pools',
    );
  } else {
    console.log(
      'createAgentTools: No data pools found, cannot create search tools',
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
