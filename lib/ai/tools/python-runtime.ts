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
      'Generate and prepare Python code for execution. This tool creates Python code that can be executed in the browser using the code execution system.',
    inputSchema: z.object({
      code: z
        .string()
        .describe('The Python code to prepare for execution'),
      description: z
        .string()
        .optional()
        .describe('Optional description of what the code does'),
    }),
    execute: async ({ code, description }) => {
      try {
        // Stream the preparation start
        dataStream.write({
          type: 'data-codeExecution',
          data: {
            status: 'starting',
            description: description || 'Preparing Python code for execution...',
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

        // Stream completion with the code
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
          code: code, // Include the code in the response
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

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
