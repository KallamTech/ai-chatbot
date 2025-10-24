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
        .default(3)
        .describe('Maximum number of results to return (max 5)'),
      threshold: z
        .number()
        .optional()
        .default(0.3)
        .describe('Minimum similarity threshold'),
      title: z
        .string()
        .optional()
        .describe('Filter by document title'),
    }),
    execute: async ({
      dataPoolId,
      query,
      limit = 3,
      threshold = 0.3,
      title,
    }) => {
      try {
        // Limit results to prevent large prompts
        const maxLimit = Math.min(limit, 5);

        // Check if index exists
        const indexExists = await upstashVectorService.indexExists(dataPoolId);
        if (!indexExists) {
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Generate embedding for query
        const queryEmbedding = await generateEmbedding(query);
        if (!queryEmbedding) {
          return { error: 'Failed to generate embedding for query' };
        }

        // Simple filter for title
        const filter = title ? `title = '${title}'` : undefined;

        // Get total document count for the datapool
        const totalDocuments = await upstashVectorService.getDocumentCount(dataPoolId);

        // Search documents with higher limit to get more candidates for filtering
        const searchResults = await upstashVectorService.searchDocuments(
          dataPoolId,
          queryEmbedding,
          {
            limit: maxLimit * 3, // Get more candidates to filter by score
            filter,
            includeMetadata: true,
            includeData: true,
          },
        );

        // Filter by threshold and limit results - prioritize quality over quantity
        const filteredResults = searchResults.filter((result) => result.score >= threshold);
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
      } catch (error) {
        console.error('Error in RAG search:', error);
        return { error: 'Failed to search documents' };
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
        .default(3)
        .describe('Maximum number of results to return (max 5)'),
      threshold: z
        .number()
        .optional()
        .default(0.3)
        .describe('Minimum similarity threshold'),
      title: z
        .string()
        .optional()
        .describe('Filter by document title'),
    }),
    execute: async ({
      dataPoolName,
      query,
      limit = 3,
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
            availableDataPools: availableDataPools?.map((dp) => ({
              id: dp.id,
              name: dp.name,
            })) || [],
          };
        }

        const dataPoolId = targetDataPool.id;

        // Limit results to prevent large prompts
        const maxLimit = Math.min(limit, 5);

        // Check if index exists
        const indexExists = await upstashVectorService.indexExists(dataPoolId);
        if (!indexExists) {
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Generate embedding for query
        const queryEmbedding = await generateEmbedding(query);
        if (!queryEmbedding) {
          return { error: 'Failed to generate embedding for query' };
        }

        // Simple filter for title
        const filter = title ? `title = '${title}'` : undefined;

        // Get total document count for the datapool
        const totalDocuments = await upstashVectorService.getDocumentCount(dataPoolId);

        // Search documents with higher limit to get more candidates for filtering
        const searchResults = await upstashVectorService.searchDocuments(
          dataPoolId,
          queryEmbedding,
          {
            limit: maxLimit * 3, // Get more candidates to filter by score
            filter,
            includeMetadata: true,
            includeData: true,
          },
        );

        // Filter by threshold and limit results - prioritize quality over quantity
        const filteredResults = searchResults.filter((result) => result.score >= threshold);
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
      } catch (error) {
        console.error('Error in RAG search:', error);
        return { error: 'Failed to search documents' };
      }
    },
  });
