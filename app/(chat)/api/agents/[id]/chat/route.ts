import {
  convertToModelMessages,
  createUIMessageStream,
  JsonToSseTransformStream,
  smoothStream,
  stepCountIs,
  streamText,
} from 'ai';
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

} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '@/app/(chat)/actions';
import { ragSearch } from '@/lib/ai/tools/rag-search';
import { datapoolFetch } from '@/lib/ai/tools/datapool-fetch';
import { findDocumentByTitle } from '@/lib/ai/tools/find-document-by-title';
import { getDocumentMetadata } from '@/lib/ai/tools/get-document-metadata';
import { searchSpecificDocument } from '@/lib/ai/tools/search-specific-document';
import { searchImages } from '@/lib/ai/tools/search-images';
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

    // Use the imported tools directly for search capabilities
    tools.searchDocuments = ragSearch(session, dataPools);
    tools.datapoolFetch = datapoolFetch(session, dataPools);
    tools.findDocumentByTitle = findDocumentByTitle(dataPools);
    tools.getDocumentMetadata = getDocumentMetadata();

    tools.searchSpecificDocument = searchSpecificDocument(dataPools);
    tools.searchImages = searchImages(dataPools);

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
