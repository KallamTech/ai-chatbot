import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '@/lib/types';

interface PythonRuntimeProps {
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const pythonRuntime = ({ dataStream }: PythonRuntimeProps) =>
  tool({
    description:
      'Generate and prepare Python code for execution. This tool creates Python code that can be executed in the browser using the code execution system. When waitForExecution is true, the agent will wait for the user to execute the code and then receive the results.',
    inputSchema: z.object({
      code: z.string().describe('The Python code to prepare for execution'),
      description: z
        .string()
        .optional()
        .describe('Optional description of what the code does'),
      waitForExecution: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          'Whether to wait for user execution and return results. When true, the agent will pause and wait for execution results.',
        ),
    }),
    execute: async ({ code, description, waitForExecution }) => {
      try {
        // Stream the preparation start
        dataStream.write({
          type: 'data-codeExecution',
          data: {
            status: 'starting',
            description:
              description || 'Preparing Python code for execution...',
          },
          transient: true,
        });

        // Stream the code preparation
        dataStream.write({
          type: 'data-codeExecution',
          data: {
            status: 'loading_packages',
            message: 'Code prepared for browser execution',
          },
          transient: true,
        });

        if (waitForExecution) {
          // Stream waiting status
          dataStream.write({
            type: 'data-codeExecution',
            data: {
              status: 'waiting_for_execution',
              output: `Python code prepared:\n\n${code}`,
              result: 'Waiting for user to execute code...',
              waitForExecution: true,
            },
            transient: true,
          });

          return {
            success: true,
            output: `Python code prepared:\n\n${code}`,
            result:
              'Waiting for user execution. Please execute the code to continue.',
            description:
              description || 'Python code prepared - waiting for execution',
            code: code,
            waitForExecution: true,
          };
        } else {
          // Stream completion with the code (original behavior)
          dataStream.write({
            type: 'data-codeExecution',
            data: {
              status: 'completed',
              output: `Python code prepared:\n\n${code}`,
              result: 'Code ready for execution in browser',
            },
            transient: true,
          });

          return {
            success: true,
            output: `Python code prepared:\n\n${code}`,
            result: 'Code ready for execution in browser',
            description: description || 'Python code prepared successfully',
            code: code,
          };
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';

        dataStream.write({
          type: 'data-codeExecution',
          data: {
            status: 'error',
            error: errorMessage,
          },
          transient: true,
        });

        return {
          success: false,
          error: errorMessage,
          description: description || 'Python code preparation failed',
        };
      }
    },
  });
