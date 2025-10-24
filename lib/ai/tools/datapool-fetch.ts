import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDataPoolDocumentsFiltered } from '@/lib/db/queries';

export const datapoolFetch = () =>
  tool({
    description:
      'Search and retrieve documents from a data pool using a text query. This tool requires a search query string to find matching documents by title or filename. Use this when you need to find specific documents within a data pool.',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool to search in'),
      query: z
        .string()
        .min(1)
        .describe('Search text - you must provide keywords or terms to search for in document titles and filenames. Cannot be empty.'),
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
      query,
      limit = 20,
      offset = 0,
      includeContent = true,
    }) => {
      try {
        // Validate required parameters
        if (!dataPoolId) {
          return { error: 'dataPoolId is required' };
        }
        if (!query || query.trim().length === 0) {
          return { error: 'query is required and cannot be empty' };
        }

        const trimmedQuery = query.trim();
        const docs = await getDataPoolDocumentsFiltered({
          dataPoolId,
          query: trimmedQuery,
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
            query: trimmedQuery,
            limit,
            offset,
          },
          documents: items,
        };
      } catch (error) {
        console.error('Error in datapoolFetch tool:', error);
        return { error: 'Failed to fetch datapool documents' };
      }
    },
  });
