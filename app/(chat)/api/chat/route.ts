import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
  tool,
} from 'ai';
import { auth, type UserType } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import { myProvider } from '@/lib/ai/providers';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  saveChat,
  saveMessages,
  getDataPoolsByUserId,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { createAgent } from '@/lib/ai/tools/create-agent';
import { webSearch, newsSearch } from '@/lib/ai/tools/websearch';
import { deepResearch } from '@/lib/ai/tools/deepresearch';
import { generateImage } from '@/lib/ai/tools/generate-image';
import { ragSearch } from '@/lib/ai/tools/rag-search';
import { directFetch } from '@/lib/ai/tools/direct-fetch';
import { z } from 'zod';
import { isProductionEnvironment } from '@/lib/constants';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import {
  postRequestBodySchemaGuest,
  postRequestBodySchemaAuthenticated,
  type PostRequestBodyGuest,
  type PostRequestBodyAuthenticated,
} from './schema';
import { geolocation } from '@vercel/functions';
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
 * and replaces base64 content in tool-generatedImage parts
 * @param messages Array of database messages
 * @returns Filtered array of messages with base64 content replaced
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

  let filteredMessages = messages;
  if (lastErrorIndex !== -1) {
    filteredMessages = messages.slice(lastErrorIndex);
  }

  // Process messages to replace base64 content in tool-generatedImage parts
  const filteredMessagesProcessed = filteredMessages.map((message) => {
    if (!message.parts) {
      return message;
    }

    const processedParts = message.parts.map((part: any) => {
      if (
        part.type === 'tool-generateImage' &&
        part.output?.imageData?.base64
      ) {
        return {
          ...part,
          output: {
            ...part.output,
            imageData: {
              ...part.output.imageData,
              base64: 'Omitted for context window limitation',
            },
          },
        };
      }
      return part;
    });

    return {
      ...message,
      parts: processedParts,
    };
  });

  return filteredMessagesProcessed;
}

let globalStreamContext: ResumableStreamContext | null = null;

export function getStreamContext() {
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

export async function POST(request: Request) {
  let requestBody: PostRequestBodyGuest | PostRequestBodyAuthenticated;

  try {
    const json = await request.json();

    // First check if user is authenticated to determine which schema to use
    const session = await auth();

    if (session?.user?.type === 'guest') {
      // User is not authenticated, use the guest schema
      requestBody = postRequestBodySchemaGuest.parse(json);
    } else {
      // User is authenticated, use the authenticated schema
      requestBody = postRequestBodySchemaAuthenticated.parse(json);
    }
  } catch (error) {
    console.error('Error parsing request body:', error);
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      connectedDataPools,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: ChatModel['id'];
      selectedVisibilityType: VisibilityType;
      connectedDataPools?: string[];
    } = requestBody;

    const session = await auth();

    // For now, we still require authentication to proceed with chat
    // This could be changed later to allow guest users
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

    const chat = await getChatById({ id });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
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

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

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
      execute: async ({ writer: dataStream }) => {
        // Get user's datapools for RAG search
        const userDataPools = await getDataPoolsByUserId({
          userId: session.user.id,
        });

        // Filter to only connected datapools (only use connected ones, not all user datapools)
        const availableDataPools =
          connectedDataPools && connectedDataPools.length > 0
            ? userDataPools.filter((dp) => connectedDataPools.includes(dp.id))
            : [];

        // Create RAG search tool that can search across connected datapools
        const createRagSearchTool = () => {
          if (availableDataPools.length === 0) {
            return null; // No datapools available
          }

          return tool({
            description:
              'Search through documents in your connected data pools using semantic similarity',
            inputSchema: z.object({
              query: z.string().describe('Search query'),
              dataPoolId: z
                .string()
                .describe(
                  `ID of the data pool to search. Available data pools: ${availableDataPools.map((dp) => `${dp.id} (${dp.name})`).join(', ')}`,
                ),
              limit: z
                .number()
                .optional()
                .default(5)
                .describe('Maximum number of results to return'),
              threshold: z
                .number()
                .optional()
                .default(0.3)
                .describe('Minimum similarity threshold (0.3 is more lenient)'),
            }),
            execute: async ({
              query,
              dataPoolId,
              limit = 5,
              threshold = 0.3,
            }: {
              query: string;
              dataPoolId: string;
              limit?: number;
              threshold?: number;
            }) => {
              try {
                // Verify the datapool is available (connected and belongs to the user)
                const targetDataPool = availableDataPools.find(
                  (dp) => dp.id === dataPoolId,
                );
                if (!targetDataPool) {
                  return {
                    error: `Data pool with ID ${dataPoolId} not found or not connected to this chat`,
                    availableDataPools: availableDataPools.map((dp) => ({
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
                  threshold,
                  ...(selectedChatModel && { modelId: selectedChatModel }),
                });

                return {
                  ...result,
                  searchedDataPool: {
                    id: targetDataPool.id,
                    name: targetDataPool.name,
                  },
                };
              } catch (error) {
                console.error('Error in RAG search:', error);
                return {
                  error: 'Failed to search documents',
                };
              }
            },
          });
        };

        const ragSearchTool = createRagSearchTool();
        const createDirectFetchTool = () => {
          if (availableDataPools.length === 0) return null;

          return tool({
            description:
              'Fetch documents directly from connected data pools with SQL filters (title, metadata.fileName).',
            inputSchema: z.object({
              dataPoolId: z
                .string()
                .describe(
                  `ID of the data pool. Available: ${availableDataPools.map((dp) => `${dp.id} (${dp.name})`).join(', ')}`,
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
              const targetDataPool = availableDataPools.find(
                (dp) => dp.id === dataPoolId,
              );
              if (!targetDataPool) {
                return {
                  error: `Data pool with ID ${dataPoolId} not found or not connected to this chat`,
                  availableDataPools: availableDataPools.map((dp) => ({
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
        };
        const directFetchTool = createDirectFetchTool();
        const tools: any = {
          getWeather,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({
            session,
            dataStream,
          }),
          createAgent: createAgent({ session, dataStream }),
          webSearch: webSearch(),
          newsSearch: newsSearch(),
          deepResearch: deepResearch(),
          generateImage: generateImage({ dataStream }),
        };

        const activeTools = [
          'getWeather',
          'createDocument',
          'updateDocument',
          'requestSuggestions',
          'createAgent',
          'webSearch',
          'newsSearch',
          'deepResearch',
          'generateImage',
        ];

        // Add RAG search tool if user has datapools
        if (ragSearchTool) {
          tools.ragSearch = ragSearchTool;
          activeTools.push('ragSearch');
        }
        // Add SQL-backed datapool fetch tool for high-level doc retrieval
        if (sqlFetchTool) {
          tools.directFetch = directFetchTool;
          activeTools.push('directFetch');
        }

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({
            selectedChatModel,
            requestHints,
            connectedDataPools: availableDataPools.map((dp) => ({
              id: dp.id,
              name: dp.name,
            })),
          }),
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),
          experimental_activeTools: activeTools,
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools,
          experimental_telemetry: {
            isEnabled: isProductionEnvironment,
            functionId: 'stream-text',
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
      onError: (error) => {
        console.log('Error detected', error);
        return 'Oops, an error occurred!';
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
    console.error('Error in chat stream:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
