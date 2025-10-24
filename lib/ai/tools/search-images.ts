import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { ragSearchById } from './rag-search';

export const searchImages = (dataPools: any[]) =>
  tool({
    description:
      'Search specifically for images and visual content across all your connected data pools',
    inputSchema: z.object({
      query: z
        .string()
        .describe(
          'Search query for images (e.g., "charts", "graphs", "diagrams")',
        ),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of image results to return'),
      threshold: z
        .number()
        .optional()
        .default(0.1)
        .describe('Similarity threshold (0.1 recommended for images)'),
      dataPoolId: z
        .string()
        .optional()
        .describe('Optional: Search in a specific data pool by ID'),
    }),
    execute: async ({ query, limit = 5, threshold = 0.1, dataPoolId }) => {
      console.log('Searching for images with query:', query);

      try {
        // If a specific data pool is requested, search only that one
        if (dataPoolId) {
          const targetDataPool = dataPools.find((dp) => dp.id === dataPoolId);
          if (!targetDataPool) {
            return {
              error: `Data pool with ID ${dataPoolId} not found in connected data pools`,
              availableDataPools: dataPools.map((dp) => ({
                id: dp.id,
                name: dp.name,
              })),
              searchType: 'image_search',
            };
          }

          const ragSearchTool = ragSearchById();
          const result = await (ragSearchTool as any).execute({
            dataPoolId: targetDataPool.id,
            query,
            limit,
            threshold: Math.max(threshold, 0.1), // Ensure minimum threshold for images
          });

          return {
            ...result,
            searchType: 'image_search',
            recommendedThreshold: '0.1 for comprehensive image results',
            searchedDataPool: {
              id: targetDataPool.id,
              name: targetDataPool.name,
            },
          };
        }

        // Search across all data pools for images
        const ragSearchTool = ragSearchById();  // Use the ID-based version since this tool works internally
        const searchPromises = dataPools.map(async (dataPool) => {
          try {
            const result = await (ragSearchTool as any).execute({
              dataPoolId: dataPool.id,
              query,
              limit: Math.ceil(limit / dataPools.length), // Distribute limit across pools
              threshold: Math.max(threshold, 0.1), // Ensure minimum threshold for images
            });

            return {
              dataPool: { id: dataPool.id, name: dataPool.name },
              results: result,
            };
          } catch (error) {
            console.error(
              `Error searching images in data pool ${dataPool.id}:`,
              error,
            );
            return {
              dataPool: { id: dataPool.id, name: dataPool.name },
              error: 'Image search failed for this data pool',
            };
          }
        });

        const searchResults = await Promise.all(searchPromises);

        // Combine results from all data pools
        const combinedResults = {
          query,
          totalResults: 0,
          dataPools: searchResults,
          searchedDataPools: dataPools.map((dp) => ({
            id: dp.id,
            name: dp.name,
          })),
          searchType: 'image_search',
          recommendedThreshold: '0.1 for comprehensive image results',
        };

        // Count total results
        searchResults.forEach((result) => {
          if (result.results?.results) {
            combinedResults.totalResults += result.results.results.length;
          }
        });

        return combinedResults;
      } catch (error) {
        console.error('Error searching images:', error);
        return {
          error: 'Failed to search images',
          searchType: 'image_search',
        };
      }
    },
  });
