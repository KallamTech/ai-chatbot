import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDataPoolDocumentsFiltered } from '@/lib/db/queries';

export const directFetch = () =>
  tool({
    description:
      'Directly fetch document content by title or filename. Use this when the user explicitly asks for a specific document, rather than performing a semantic search. This tool is ideal for retrieving a document to perform a high-level task, such as summarizing a PDF.',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool'),
      title: z
        .string()
        .optional()
        .describe('Partial match filter for document title'),
      fileName: z
        .string()
        .optional()
        .describe('Partial match filter for metadata.fileName'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Max number of documents to return'),
      offset: z
        .number()
        .optional()
        .default(0)
        .describe('Offset for pagination'),
      includeContent: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include full content in the response'),
    }),
    execute: async ({
      dataPoolId,
      title,
      fileName,
      limit = 20,
      offset = 0,
      includeContent = true,
    }) => {
      try {
        const docs = await getDataPoolDocumentsFiltered({
          dataPoolId,
          title,
          fileName,
          limit,
          offset,
        });

        const items = docs.map((d) => ({
          id: d.id,
          title: d.title,
          createdAt: d.createdAt,
          metadata: d.metadata || {},
          content: includeContent ? d.content : undefined,
        }));

        return {
          count: items.length,
          dataPoolId,
          filters: {
            ...(title && { title }),
            ...(fileName && { fileName }),
            limit,
            offset,
          },
          documents: items,
        };
      } catch (error) {
        console.error('Error in directFetch tool:', error);
        return { error: 'Failed to fetch datapool documents' };
      }
    },
  });
