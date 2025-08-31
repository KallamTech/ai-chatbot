import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDataPoolDocuments } from '@/lib/db/queries';
import { generateEmbedding } from '@/lib/utils';

// RAG search tool for workflow nodes
export const ragSearch = () =>
  tool({
    description: 'Search through documents in a data pool using semantic similarity',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool to search'),
      query: z.string().describe('Search query'),
      limit: z.number().optional().default(5).describe('Maximum number of results to return'),
      threshold: z.number().optional().default(0.3).describe('Minimum similarity threshold (0.3 is more lenient)'),
    }),
    execute: async ({ dataPoolId, query, limit, threshold }) => {
      try {
        console.log('RAG Search: Starting search for data pool:', dataPoolId);
        console.log('RAG Search: Query:', query);

        // Get all documents from the data pool
        const documents = await getDataPoolDocuments({ dataPoolId });
        console.log('RAG Search: Found documents in database:', documents.length);

        if (documents.length === 0) {
          console.log('RAG Search: No documents found in data pool');
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
        console.log('RAG Search: Processing documents for similarity...');
        const scoredDocuments = documents
          .map(doc => {
            console.log('RAG Search: Document:', doc.title, 'has embedding:', !!doc.embedding);

            if (!doc.embedding) {
              console.log('RAG Search: Document has no embedding, skipping:', doc.title);
              return { ...doc, similarity: 0 };
            }

            const similarity = cosineSimilarityLocal(
              queryEmbedding,
              doc.embedding as number[]
            );

            console.log('RAG Search: Document similarity score:', doc.title, similarity);

            return { ...doc, similarity };
          })
          .filter(doc => doc.similarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        console.log('RAG Search: Documents above threshold:', scoredDocuments.length);

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