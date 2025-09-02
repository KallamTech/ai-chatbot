import 'server-only';

import { tool, generateText } from 'ai';
import { z } from 'zod';
import {
  createAgent as createAgentInDB,
  createWorkflowNode,
  createWorkflowEdge,
} from '@/lib/db/queries';
import { myProvider, ModelId } from '../providers';
import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '@/lib/types';
import type { Session } from 'next-auth';

interface CreateAgentProps {
  session: Session | null;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const createAgent = ({ session, dataStream }: CreateAgentProps) =>
  tool({
    description:
      'Create an AI agent with a workflow based on the user requirements. This tool analyzes the user request and creates an agent with appropriate workflow nodes.',
    inputSchema: z.object({
      description: z
        .string()
        .describe('Description of what the agent should do'),
      workflowRequirements: z
        .string()
        .describe(
          'Detailed requirements for the workflow nodes and connections',
        ),
    }),
    execute: async ({ description, workflowRequirements }) => {
      if (!session?.user?.id) {
        return {
          error: 'User must be logged in to create agents',
        };
      }

      try {
        // Generate agent title and refined description using AI
        const { text: generatedContent } = await generateText({
          model: myProvider.languageModel(ModelId.GPT_4_1),
          system:
            'You are a helpful assistant that creates AI agent specifications. Generate a concise title and refined description for an agent based on user requirements.',
          prompt: `User wants to create an agent that: ${description}

          Generate:
          1. A short, clear title (max 50 characters)
          2. A refined description (max 200 characters) explaining what the agent does

          Format your response as:
          Title: [title]
          Description: [description]`,
        });

        // Parse the generated content
        const titleMatch = generatedContent.match(/Title:\s*(.+)/);
        const descriptionMatch = generatedContent.match(/Description:\s*(.+)/);

        const agentTitle = titleMatch?.[1]?.trim() || 'AI Agent';
        const agentDescription = descriptionMatch?.[1]?.trim() || description;

        // Create the agent
        const agent = await createAgentInDB({
          title: agentTitle,
          description: agentDescription,
          userId: session.user.id,
        });

        dataStream.write({
          type: 'data-id',
          data: agent.id,
          transient: true,
        });

        dataStream.write({
          type: 'data-title',
          data: agent.title,
          transient: true,
        });

        // Analyze workflow requirements and create nodes
        const { text: workflowAnalysis } = await generateText({
          model: myProvider.languageModel(ModelId.GPT_4_1),
          system: `You are an expert workflow architect for AI agents. Create optimized workflow specifications based on user requirements.

**Available Node Types:**
- **rag**: Retrieval Augmented Generation - searches and retrieves relevant documents from data pools
- **transform**: Data transformation - processes, formats, or converts data using LLM capabilities
- **filter**: Data filtering - applies criteria to filter or validate data based on specific conditions
- **aggregate**: Data aggregation - combines, summarizes, or synthesizes multiple data sources
- **analyze**: Data analysis - performs analysis, pattern recognition, or insights generation
- **generate**: Content generation - creates new content based on processed data
- **runtime**: Python runtime execution - executes Python code for computations, data processing, and algorithmic tasks

**Node Creation Guidelines:**
1. Create 2-4 nodes maximum for optimal performance
2. Start with RAG nodes for document access
3. Use Transform nodes for data processing
4. Use Runtime nodes for computational tasks, algorithms, data analysis, or when Python execution is needed
5. End with Generate or Aggregate nodes for final output
6. Each node should have a clear, single responsibility
7. System prompts should be specific and actionable

**System Prompt Best Practices:**
- Be specific about the node's role and capabilities
- Include clear instructions on what to do with input data
- Specify output format and quality expectations
- Mention any constraints or limitations
- Use active voice and clear language

**Output Format:**
Return a JSON array of nodes. Each node must include:
- name: Short, descriptive name (2-4 words)
- description: Clear explanation of the node's purpose
- nodeType: One of the available types above
- systemPrompt: Detailed, actionable system prompt (2-3 sentences)
- position: {x: number, y: number} coordinates for visual layout

Return only the JSON array, no additional text.`,
          prompt: `Agent Requirements: ${workflowRequirements}

Agent Purpose: ${agentDescription}

Create an optimized workflow that efficiently processes the user's requirements. Focus on creating a logical flow that maximizes the agent's effectiveness.`,
        });

        let workflowNodes: any[] = [];
        try {
          workflowNodes = JSON.parse(workflowAnalysis);
        } catch (error) {
          // Fallback: Create a simple RAG + Transform workflow
          workflowNodes = [
            {
              name: 'Document Search',
              description:
                'Searches and retrieves relevant documents from the data pool',
              nodeType: 'rag',
              systemPrompt: `You are a specialized document search assistant for the "${agentTitle}" agent. Your role is to efficiently search through the available documents in the data pool and retrieve the most relevant information to answer user queries. Use semantic search to find documents that best match the user's intent, and return comprehensive results that provide context and supporting evidence.`,
              position: { x: 100, y: 100 },
            },
            {
              name: 'Process & Format',
              description:
                'Processes search results and formats them into clear, actionable responses',
              nodeType: 'transform',
              systemPrompt: `You are a data processing specialist for the "${agentTitle}" agent. Your role is to take the document search results and transform them into clear, well-structured, and actionable responses. Synthesize information from multiple sources, eliminate redundancy, and present findings in a format that directly addresses the user's query with supporting evidence and context.`,
              position: { x: 300, y: 100 },
            },
          ];
        }

        // Create workflow nodes
        const createdNodes = [];
        for (const nodeSpec of workflowNodes) {
          const node = await createWorkflowNode({
            agentId: agent.id,
            name: nodeSpec.name,
            description: nodeSpec.description,
            systemPrompt: nodeSpec.systemPrompt,
            position: nodeSpec.position,
            nodeType: nodeSpec.nodeType,
            config: nodeSpec.config || {},
          });
          createdNodes.push(node);
        }

        // Create edges between nodes (simple linear flow for now)
        for (let i = 0; i < createdNodes.length - 1; i++) {
          await createWorkflowEdge({
            agentId: agent.id,
            sourceNodeId: createdNodes[i].id,
            targetNodeId: createdNodes[i + 1].id,
          });
        }

        dataStream.write({
          type: 'data-finish',
          data: null,
          transient: true,
        });

        return {
          success: true,
          agent: {
            id: agent.id,
            title: agent.title,
            description: agent.description,
          },
          dataPool: null, // No data pool created automatically
          workflow: {
            nodes: createdNodes.length,
            edges: Math.max(0, createdNodes.length - 1),
          },
        };
      } catch (error) {
        console.error('Error creating agent:', error);
        return {
          error: 'Failed to create agent. Please try again.',
        };
      }
    },
  });
