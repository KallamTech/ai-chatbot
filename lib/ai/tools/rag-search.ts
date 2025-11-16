import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { upstashVectorService } from '@/lib/vector/upstash';
import { generateEmbedding } from '@/lib/utils';

// Internal RAG search tool that accepts dataPoolId (for internal tool use)
export const ragSearchById = () =>
  tool({
    description:
      'Search for documents in a data pool using semantic similarity. Use this when the user is asking a question about their documents.',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool to search'),
      query: z.string().describe('Search query'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of results to return (max 10)'),
      threshold: z
        .number()
        .optional()
        .default(0.3)
        .describe('Minimum similarity threshold'),
      title: z.string().optional().describe('Filter by document title'),
    }),
    execute: async ({
      dataPoolId,
      query,
      limit = 10,
      threshold = 0.3,
      title,
    }) => {
      try {
        // Limit results to prevent large prompts
        const maxLimit = Math.min(limit, 10);

        // Check if index exists
        let indexExists = false;
        try {
          indexExists = await upstashVectorService.indexExists(dataPoolId);
        } catch (error: any) {
          console.error('Error checking index existence:', error);
          // Check if it's a network error
          if (
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            error.errno
          ) {
            return {
              results: [],
              error:
                'Vector database is currently unavailable. Please try again later.',
              networkError: true,
            };
          }
          throw error;
        }

        if (!indexExists) {
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Generate embedding for query
        let queryEmbedding: number[] | null | undefined;
        try {
          queryEmbedding = await generateEmbedding(query);
        } catch (error: any) {
          console.error('Error generating embedding:', error);
          return {
            results: [],
            error: 'Failed to generate search embedding. Please try again.',
          };
        }

        if (!queryEmbedding) {
          return {
            results: [],
            error: 'Failed to generate embedding for query',
          };
        }

        // Simple filter for title
        const filter = title ? `title = '${title}'` : undefined;

        // Get total document count for the datapool
        let totalDocuments = 0;
        try {
          totalDocuments =
            await upstashVectorService.getDocumentCount(dataPoolId);
        } catch (error: any) {
          console.error('Error getting document count:', error);
          // Continue without document count
        }

        // Search documents with higher limit to get more candidates for filtering
        let searchResults = [];
        try {
          searchResults = await upstashVectorService.searchDocuments(
            dataPoolId,
            queryEmbedding,
            {
              limit: maxLimit * 2, // Get more candidates to filter by score
              filter,
              includeMetadata: true,
              includeData: true,
            },
          );
        } catch (error: any) {
          console.error('Error searching documents:', error);
          // Check if it's a network error
          if (
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            error.errno
          ) {
            return {
              results: [],
              error:
                'Vector database is currently unavailable. Please try again later.',
              networkError: true,
            };
          }
          return {
            results: [],
            error: 'Failed to search documents. Please try again.',
          };
        }

        // Filter by threshold and limit results - prioritize quality over quantity
        const filteredResults = searchResults.filter(
          (result) => result.score >= threshold,
        );
        const results = filteredResults
          .sort((a, b) => b.score - a.score)
          .slice(0, maxLimit) // Only take the top scoring results
          .map((result) => ({
            id: result.id,
            title: result.metadata?.title || 'Untitled',
            content: result.content, // Return full content without truncation
            similarity: Math.round(result.score * 100) / 100, // Round to 2 decimals
          }));

        return {
          results,
          count: results.length,
          returnedCount: results.length,
          filteredCount: filteredResults.length,
          totalDocuments,
        };
      } catch (error: any) {
        console.error('Error in RAG search:', error);
        // Check if it's a network error
        if (
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNREFUSED' ||
          error.errno
        ) {
          return {
            results: [],
            error:
              'Vector database is currently unavailable. Please try again later.',
            networkError: true,
          };
        }
        return {
          results: [],
          error: 'Failed to search documents. Please try again.',
        };
      }
    },
  });

// External RAG search tool that accepts dataPoolName (for direct user interaction)
export const ragSearch = (session?: any, availableDataPools?: any[]) =>
  tool({
    description:
      'Search for documents in a data pool using semantic similarity. Use this when the user is asking a question about their documents.',
    inputSchema: z.object({
      dataPoolName: z.string().describe('Name of the data pool to search'),
      query: z.string().describe('Search query'),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of results to return (max 10)'),
      threshold: z
        .number()
        .optional()
        .default(0.3)
        .describe('Minimum similarity threshold'),
      title: z.string().optional().describe('Filter by document title'),
    }),
    execute: async ({
      dataPoolName,
      query,
      limit = 10,
      threshold = 0.3,
      title,
    }) => {
      try {
        // First, verify the datapool is available (connected and belongs to the user)
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

        // Limit results to prevent large prompts
        const maxLimit = Math.min(limit, 10);

        // Check if index exists
        let indexExists = false;
        try {
          indexExists = await upstashVectorService.indexExists(dataPoolId);
        } catch (error: any) {
          console.error('Error checking index existence:', error);
          // Check if it's a network error
          if (
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            error.errno
          ) {
            return {
              results: [],
              error:
                'Vector database is currently unavailable. Please try again later.',
              networkError: true,
            };
          }
          throw error;
        }

        if (!indexExists) {
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Generate embedding for query
        let queryEmbedding: number[] | null | undefined;
        try {
          queryEmbedding = await generateEmbedding(query);
        } catch (error: any) {
          console.error('Error generating embedding:', error);
          return {
            results: [],
            error: 'Failed to generate search embedding. Please try again.',
          };
        }

        if (!queryEmbedding) {
          return {
            results: [],
            error: 'Failed to generate embedding for query',
          };
        }

        // Simple filter for title
        const filter = title ? `title = '${title}'` : undefined;

        // Get total document count for the datapool
        let totalDocuments = 0;
        try {
          totalDocuments =
            await upstashVectorService.getDocumentCount(dataPoolId);
        } catch (error: any) {
          console.error('Error getting document count:', error);
          // Continue without document count
        }

        // Search documents with higher limit to get more candidates for filtering
        let searchResults = [];
        try {
          searchResults = await upstashVectorService.searchDocuments(
            dataPoolId,
            queryEmbedding,
            {
              limit: maxLimit * 2, // Get more candidates to filter by score
              filter,
              includeMetadata: true,
              includeData: true,
            },
          );
        } catch (error: any) {
          console.error('Error searching documents:', error);
          // Check if it's a network error
          if (
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            error.errno
          ) {
            return {
              results: [],
              error:
                'Vector database is currently unavailable. Please try again later.',
              networkError: true,
            };
          }
          return {
            results: [],
            error: 'Failed to search documents. Please try again.',
          };
        }

        // Filter by threshold and limit results - prioritize quality over quantity
        const filteredResults = searchResults.filter(
          (result) => result.score >= threshold,
        );
        const results = filteredResults
          .sort((a, b) => b.score - a.score)
          .slice(0, maxLimit) // Only take the top scoring results
          .map((result) => ({
            id: result.id,
            title: result.metadata?.title || 'Untitled',
            content: result.content, // Return full content without truncation
            similarity: Math.round(result.score * 100) / 100, // Round to 2 decimals
          }));

        return {
          results,
          count: results.length,
          returnedCount: results.length,
          filteredCount: filteredResults.length,
          totalDocuments,
        };
      } catch (error: any) {
        console.error('Error in RAG search:', error);
        // Check if it's a network error
        if (
          error.code === 'ENOTFOUND' ||
          error.code === 'ECONNREFUSED' ||
          error.errno
        ) {
          return {
            results: [],
            error:
              'Vector database is currently unavailable. Please try again later.',
            networkError: true,
          };
        }
        return {
          results: [],
          error: 'Failed to search documents. Please try again.',
        };
      }
    },
  });
