import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDataPoolDocumentsFiltered } from '@/lib/db/queries';

export const datapoolFetch = (session?: any, availableDataPools?: any[]) =>
  tool({
    description:
      'Search and retrieve documents from a data pool using a text query. This tool requires a search query string to find matching documents by title or filename. Use this when you need to find specific documents within a data pool.',
    inputSchema: z.object({
      dataPoolName: z.string().describe('Name of the data pool to search in'),
      query: z
        .string()
        .min(1)
        .describe(
          'Search text - you must provide keywords or terms to search for in document titles and filenames. Cannot be empty.',
        ),
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
      dataPoolName,
      query,
      limit = 20,
      offset = 0,
      includeContent = true,
    }) => {
      try {
        // Validate required parameters
        if (!dataPoolName) {
          return { error: 'dataPoolName is required' };
        }
        if (!query || query.trim().length === 0) {
          return { error: 'query is required and cannot be empty' };
        }

        // Verify the datapool is available (connected and belongs to the user)
        const targetDataPool = availableDataPools?.find(
          (dp) => dp.name === dataPoolName,
        );
        if (!targetDataPool) {
          return {
            error: `Data pool '${dataPoolName}' not found or not connected to this chat`,
            availableDataPools:
              availableDataPools?.map((dp) => ({
                id: dp.id,
                name: dp.name,
              })) || [],
          };
        }

        const dataPoolId = targetDataPool.id;

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
          dataPoolName,
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
