import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import {
  searchDataPoolDocumentsByTitle,
  getDataPoolDocumentTitles,
} from '@/lib/db/queries';

export const findDocumentByTitle = (dataPools: any[]) =>
  tool({
    description:
      'Find a specific document by its title, filename, or partial name match across all connected data pools',
    inputSchema: z.object({
      title: z
        .string()
        .describe('Document title, filename, or partial name to search for'),
      exactMatch: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to require an exact match or allow partial matches'),
      dataPoolId: z
        .string()
        .optional()
        .describe('Optional: Search in a specific data pool by ID'),
    }),
    execute: async ({ title, exactMatch, dataPoolId }) => {
      console.log('Finding document by title:', title);

      try {
        // If a specific data pool is requested, search only that one
        if (dataPoolId) {
          const targetDataPool = dataPools.find((dp) => dp.id === dataPoolId);
          if (!targetDataPool) {
            return {
              found: false,
              error: `Data pool with ID ${dataPoolId} not found in connected data pools`,
              availableDataPools: dataPools.map((dp) => ({
                id: dp.id,
                name: dp.name,
              })),
            };
          }

          const matches = await searchDataPoolDocumentsByTitle({
            dataPoolId: targetDataPool.id,
            title,
            exactMatch,
            limit: 50,
          });

          if (matches.length === 0) {
            const suggestions = await getDataPoolDocumentTitles({
              dataPoolId: targetDataPool.id,
              limit: 5,
            });

            return {
              found: false,
              message: `No documents found matching "${title}" in data pool "${targetDataPool.name}"`,
              suggestions,
              searchedDataPool: {
                id: targetDataPool.id,
                name: targetDataPool.name,
              },
            };
          }

          return {
            found: true,
            count: matches.length,
            documents: matches.map((doc) => ({
              id: doc.id,
              title: doc.title,
              metadata: doc.metadata,
              createdAt: doc.createdAt,
            })),
            searchedDataPool: {
              id: targetDataPool.id,
              name: targetDataPool.name,
            },
          };
        }

        // Search across all data pools
        const searchPromises = dataPools.map(async (dataPool) => {
          try {
            const matches = await searchDataPoolDocumentsByTitle({
              dataPoolId: dataPool.id,
              title,
              exactMatch,
              limit: 50,
            });

            return {
              dataPool: { id: dataPool.id, name: dataPool.name },
              matches,
              count: matches.length,
            };
          } catch (error) {
            console.error(`Error searching data pool ${dataPool.id}:`, error);
            return {
              dataPool: { id: dataPool.id, name: dataPool.name },
              error: 'Search failed for this data pool',
              matches: [],
              count: 0,
            };
          }
        });

        const searchResults = await Promise.all(searchPromises);

        // Combine all matches
        const allMatches = searchResults.flatMap((result) =>
          result.matches.map((doc) => ({
            ...doc,
            dataPool: result.dataPool,
          })),
        );

        if (allMatches.length === 0) {
          // Get suggestions from all data pools
          const suggestionPromises = dataPools.map(async (dataPool) => {
            try {
              const suggestions = await getDataPoolDocumentTitles({
                dataPoolId: dataPool.id,
                limit: 3,
              });
              return {
                dataPool: { id: dataPool.id, name: dataPool.name },
                suggestions,
              };
            } catch (error) {
              return {
                dataPool: { id: dataPool.id, name: dataPool.name },
                suggestions: [],
              };
            }
          });

          const allSuggestions = await Promise.all(suggestionPromises);

          return {
            found: false,
            message: `No documents found matching "${title}" across all connected data pools`,
            suggestions: allSuggestions,
            searchedDataPools: dataPools.map((dp) => ({
              id: dp.id,
              name: dp.name,
            })),
          };
        }

        return {
          found: true,
          count: allMatches.length,
          documents: allMatches.map((doc) => ({
            id: doc.id,
            title: doc.title,
            metadata: doc.metadata,
            createdAt: doc.createdAt,
            dataPool: doc.dataPool,
          })),
          searchedDataPools: dataPools.map((dp) => ({
            id: dp.id,
            name: dp.name,
          })),
        };
      } catch (error) {
        console.error('Error finding document by title:', error);
        return {
          found: false,
          error: 'Failed to search documents',
        };
      }
    },
  });
