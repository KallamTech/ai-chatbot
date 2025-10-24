import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { ragSearchById } from './rag-search';

export const searchSpecificDocument = (dataPools: any[]) =>
  tool({
    description:
      'Search within a specific document by ID across all connected data pools, useful when you know which document to analyze',
    inputSchema: z.object({
      documentId: z
        .string()
        .describe('ID of the specific document to search within'),
      query: z
        .string()
        .describe('Search query to find specific content within the document'),
    }),
    execute: async ({ documentId, query }) => {
      console.log(
        'Searching within specific document:',
        documentId,
        'query:',
        query,
      );

      try {
        // Search for the document across all connected data pools
        let foundDocument = null;
        let documentDataPool = null;

        // Search through all data pools to find the document
        for (const dataPool of dataPools) {
          try {
            // Use the ragSearch tool to find the document by ID
            const ragSearchTool = ragSearchById();
            const searchResult = await (ragSearchTool as any).execute({
              dataPoolId: dataPool.id,
              query: `document id: ${documentId}`,
              limit: 1,
              threshold: 0.1, // Very low threshold to find exact document
            });

            if (searchResult?.results && searchResult.results.length > 0) {
              // Check if any result matches the document ID
              const matchingResult = searchResult.results.find(
                (result: any) =>
                  result.metadata && result.metadata.id === documentId,
              );

              if (matchingResult) {
                foundDocument = {
                  id: documentId,
                  title: matchingResult.metadata.title || 'Unknown Document',
                };
                documentDataPool = dataPool;
                break;
              }
            }
          } catch (error) {
            console.error(
              `Error searching for document in data pool ${dataPool.id}:`,
              error,
            );
            // Continue searching in other data pools
          }
        }

        if (!foundDocument || !documentDataPool) {
          return {
            found: false,
            message: `Document with ID ${documentId} not found in any connected data pools`,
            availableDataPools: dataPools.map((dp) => ({
              id: dp.id,
              name: dp.name,
            })),
          };
        }

        // Now search within this specific document using RAG
        const ragSearchTool = ragSearchById();
        const result = await (ragSearchTool as any).execute({
          dataPoolId: documentDataPool.id,
          query: `${query} [document: ${foundDocument.title}]`,
          limit: 3,
          threshold: 0.2, // Lower threshold for specific document search
          title: foundDocument.title, // Filter by specific document title
        });

        return {
          found: true,
          document: {
            id: foundDocument.id,
            title: foundDocument.title,
          },
          dataPool: { id: documentDataPool.id, name: documentDataPool.name },
          searchResults: result,
        };
      } catch (error) {
        console.error('Error searching specific document:', error);
        return {
          found: false,
          error: 'Failed to search within document',
        };
      }
    },
  });
