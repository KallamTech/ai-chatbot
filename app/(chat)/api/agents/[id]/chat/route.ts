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
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { ragSearch } from '@/lib/ai/tools/rag-search';
import { isProductionEnvironment } from '@/lib/constants';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from '@/app/(chat)/api/chat/schema';
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
  { params }: { params: Promise<{ id: string }> }
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

    const { longitude, latitude, city, country } = geolocation(request);

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

    // AGENT-SPECIFIC: Create agent system prompt and tools
    const agentTools = createAgentTools(workflowNodes, dataPool);
    const agentSystemPrompt = createAgentSystemPrompt(agent, workflowNodes, agentTools);

    console.log('Agent chat: Created tools:', Object.keys(agentTools));
    console.log('Agent chat: Data pool exists:', !!dataPool);
    console.log('Agent chat: Data pool ID:', dataPool?.id);

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
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
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// AGENT-SPECIFIC FUNCTIONS
function createAgentSystemPrompt(
  agent: any,
  workflowNodes: any[],
  agentTools: any
): string {
  const nodePrompts = workflowNodes
    .map(node => `- ${node.name}: ${node.systemPrompt}`)
    .join('\n');

  return `You are "${agent.title}", an AI agent with specific capabilities.

Agent Description: ${agent.description}

Your workflow consists of the following specialized nodes:
${nodePrompts}

IMPORTANT CAPABILITIES:
- You can search through documents in your data pool using the searchDocuments tool
- You can access and analyze any documents that have been uploaded to your data pool
- You can summarize, extract information, and answer questions about your documents

IMPORTANT CONSTRAINTS:
- You can ONLY perform tasks related to your defined workflow nodes
- You can ONLY access data from your assigned data pool
- You cannot perform general tasks outside your scope
- Always explain your capabilities and limitations when asked about tasks outside your scope

CRITICAL INSTRUCTION: When a user asks about documents or content, you MUST use the searchDocuments tool to find relevant information in your data pool. Do not say you cannot access documents - use the search tool first.

Available tools: ${Object.keys(agentTools).join(', ')}`;
}

function createAgentTools(workflowNodes: any[], dataPool: any) {
  const tools: any = {};

  console.log('createAgentTools: Creating tools for data pool:', !!dataPool);
  if (dataPool) {
    console.log('createAgentTools: Data pool ID:', dataPool.id);

    // Always provide document search if there's a data pool (regardless of workflow nodes)
    // Create a bound RAG search tool with the specific data pool ID
    tools.searchDocuments = tool({
      description: 'Search through documents in your data pool using semantic similarity',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        limit: z.number().optional().default(5).describe('Maximum number of results to return'),
        threshold: z.number().optional().default(0.3).describe('Minimum similarity threshold (0.3 is more lenient)'),
      }),
      execute: async ({ query, limit, threshold }) => {
        console.log('Agent chat: Searching documents with query:', query);
        console.log('Agent chat: Data pool ID:', dataPool.id);

        // Use the ragSearch tool but bind it to this specific data pool
        const ragSearchTool = ragSearch();
        const result = await (ragSearchTool as any).execute({
          dataPoolId: dataPool.id,
          query,
          limit,
          threshold: 0.3, // Lower threshold to be more lenient
        });

        console.log('Agent chat: Search result:', result);
        return result;
      },
    });

    console.log('createAgentTools: Created searchDocuments tool');
  } else {
    console.log('createAgentTools: No data pool found, cannot create search tool');
  }

  // TODO: Add more tools based on other node types:
  // - transform: text processing tools
  // - filter: data filtering tools
  // - aggregate: data aggregation tools

  return tools;
}