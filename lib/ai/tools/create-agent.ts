import 'server-only';

import { tool, generateText } from 'ai';
import { z } from 'zod';
import {
  createAgent as createAgentInDB,
  createDataPool,
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
    description: 'Create an AI agent with a workflow based on the user requirements. This tool analyzes the user request and creates an agent with appropriate workflow nodes.',
    inputSchema: z.object({
      description: z.string().describe('Description of what the agent should do'),
      workflowRequirements: z.string().describe('Detailed requirements for the workflow nodes and connections'),
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
          system: 'You are a helpful assistant that creates AI agent specifications. Generate a concise title and refined description for an agent based on user requirements.',
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

        // Create data pool for the agent
        const dataPoolName = `${agentTitle} Data Pool`;
        const dataPoolResult = await createDataPool({
          agentId: agent.id,
          name: dataPoolName,
        });

        dataStream.write({
          type: 'data-id',
          data: dataPoolResult.id,
          transient: true,
        });

        // Analyze workflow requirements and create nodes
        const { text: workflowAnalysis } = await generateText({
          model: myProvider.languageModel(ModelId.GPT_4_1),
          system: `You are a workflow architect for AI agents. Analyze the requirements and create a workflow specification.

Available node types:
- rag: Retrieval Augmented Generation (searches documents)
- transform: Transforms/processes data using LLM
- filter: Filters data based on criteria
- aggregate: Combines/summarizes multiple inputs

Create a JSON array of nodes with connections. Each node should have:
- name: Short descriptive name
- description: What this node does
- nodeType: One of the available types
- systemPrompt: Detailed system prompt for this node
- position: {x, y} coordinates for layout

Return only the JSON array, no other text.`,
          prompt: `Requirements: ${workflowRequirements}

          Agent purpose: ${agentDescription}`,
        });

        let workflowNodes: any[] = [];
        try {
          workflowNodes = JSON.parse(workflowAnalysis);
        } catch (error) {
          // Fallback: Create a simple RAG + Transform workflow
          workflowNodes = [
            {
              name: 'Document Search',
              description: 'Searches relevant documents from the data pool',
              nodeType: 'rag',
              systemPrompt: 'You are a document search assistant. Find the most relevant information from the available documents to answer user queries.',
              position: { x: 100, y: 100 },
            },
            {
              name: 'Process Results',
              description: 'Processes and formats the search results',
              nodeType: 'transform',
              systemPrompt: `You are a data processor for the "${agentTitle}" agent. Process and format information to provide clear, helpful responses.`,
              position: { x: 300, y: 100 },
            }
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
          dataPool: {
            id: dataPoolResult.id,
            name: dataPoolResult.name,
          },
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