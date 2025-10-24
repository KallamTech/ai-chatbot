import { createUIMessageStream } from '@/lib/ai-stream-manager';
import { auth } from '@/lib/auth';
import { myProvider } from '@/lib/ai-vendors';
import { saveMessages } from '@/lib/db/message-queries';
import {
  convertToModelMessages,
  convertToUIMessages,
} from '@/lib/message-utils';
import {
  postRequestBodySchema,
  PostRequestBody,
} from '@/lib/validation-schemas';
import {
  generateUUID,
  isProductionEnvironment,
} from '@/lib/utils';
import { getAgentById } from '@/lib/db/agent-queries';
import { getChatById, saveChat } from '@/lib/db/chat-queries';
import { getMessagesByChatId } from '@/lib/db/message-queries';
import {
  smoothStream,
  streamText,
} from 'ai';
import { ChatSDKError } from '@/lib/errors';
import { getWorkflowNodesByWorkflowId } from '@/lib/db/workflow-node-queries';
import { getDataPoolsByWorkflowId } from '@/lib/db/datapool-queries';
import { ragSearch } from '@/lib/tools/rag-search';
import { datapoolFetch } from '@/lib/tools/datapool-fetch';
import { findDocumentByTitle } from '@/lib/tools/find-document-by-title';
import { getDocumentMetadata } from '@/lib/tools/get-document-metadata';
import { searchSpecificDocument } from '@/lib/tools/search-specific-document';
import { searchImages } from '@/lib/tools/search-images';
import { pythonRuntime } from '@/lib/tools/python-runtime';
import { webSearch } from '@/lib/tools/web-search';
import { newsSearch } from '@/lib/tools/news-search';
import { deepResearch } from '@/lib/tools/deep-research';
import { generateImage } from '@/lib/tools/generate-image';
import { createDocument } from '@/lib/tools/create-document';
import { updateDocument } from '@/lib/tools/update-document';
import { createStreamId } from '@/lib/db/stream-queries';
import { JsonToSseTransformStream } from '@/lib/sse-stream';
import { generateTitleFromUserMessage } from '@/lib/message-title';
import { ChatMessage } from '@/lib/types';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message } = requestBody;
    const agentId = params.id;
    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const agent = await getAgentById({ id: agentId });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
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
        agentId,
      });
    } else {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });

    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

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
        const MAX_CONTEXT_LENGTH = 1000000;
        const contextLength = messagesFromDb.reduce(
          (acc, msg) => acc + JSON.stringify(msg).length,
          0,
        );
        const contextPercentage = Math.round(
          (contextLength / MAX_CONTEXT_LENGTH) * 100,
        );

        dataStream.update({
          contextPercentage,
        });

        const workflowNodes = await getWorkflowNodesByWorkflowId({
          workflowId: agent.workflowId,
        });
        const dataPools = await getDataPoolsByWorkflowId({
          workflowId: agent.workflowId,
        });

        const agentTools = createAgentTools(
          workflowNodes,
          dataPools,
          session,
          dataStream,
        );

        const systemPrompt = generateSystemPrompt(agent, workflowNodes, agentTools);
        const MAX_CONTEXT_LENGTH = 1000000;
        const contextLength =
          messagesFromDb.reduce(
            (acc, msg) => acc + JSON.stringify(msg).length,
            0,
          ) +
          JSON.stringify(message).length +
          systemPrompt.length;
        const contextPercentage = Math.round(
          (contextLength / MAX_CONTEXT_LENGTH) * 100,
        );

        dataStream.update({
          contextPercentage,
        });

        const result = streamText({
          model: myProvider.languageModel(agent.model),
          system: generateSystemPrompt(agent, workflowNodes, agentTools),
          messages: convertToModelMessages(uiMessages),
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: agentTools,
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
        const processedMessages = messages.map((message) => {
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
    });

    return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
  } catch (error) {
    console.error('Error in chat stream:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
  }
}

function generateSystemPrompt(
  agent: any,
  workflowNodes: any[],
  agentTools: any,
): string {
  const nodePrompts = workflowNodes
    .map((node) => `- ${node.title}: ${node.systemPrompt}`)
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
