import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDataPoolDocuments } from '@/lib/db/queries';
import { cosineSimilarity, generateEmbedding } from '@/lib/utils';

// RAG search tool for workflow nodes
export const ragSearch = () =>
  tool({
    description: 'Search through documents in a data pool using semantic similarity',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool to search'),
      query: z.string().describe('Search query'),
      limit: z.number().optional().default(5).describe('Maximum number of results to return'),
      threshold: z.number().optional().default(0.7).describe('Minimum similarity threshold'),
    }),
    execute: async ({ dataPoolId, query, limit, threshold }) => {
      try {
        // Get all documents from the data pool
        const documents = await getDataPoolDocuments({ dataPoolId });

        if (documents.length === 0) {
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        if (!queryEmbedding) {
          return {
            error: 'Failed to generate embedding for query',
          };
        }

        // Calculate similarity scores for each document
        const scoredDocuments = documents
          .map(doc => {
            if (!doc.embedding) {
              return { ...doc, similarity: 0 };
            }
            
            const similarity = cosineSimilarity(
              queryEmbedding,
              doc.embedding as number[]
            );
            
            return { ...doc, similarity };
          })
          .filter(doc => doc.similarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        const results = scoredDocuments.map(doc => ({
          id: doc.id,
          title: doc.title,
          content: doc.content,
          similarity: doc.similarity,
          metadata: doc.metadata,
        }));

        return {
          results,
          totalDocuments: documents.length,
          filteredCount: scoredDocuments.length,
        };

      } catch (error) {
        console.error('Error in RAG search:', error);
        return {
          error: 'Failed to search documents',
        };
      }
    },
  });

// Utility function for cosine similarity calculation
function cosineSimilarityLocal(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vector dimensions must match');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}