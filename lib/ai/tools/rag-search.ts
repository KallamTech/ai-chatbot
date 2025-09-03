import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDataPoolDocuments } from '@/lib/db/queries';
import { generateEmbedding } from '@/lib/utils';

// Context window limits for different models (approximate token counts)
const CONTEXT_LIMITS = {
  // Conservative limits to account for system prompts, user messages, and response
  'gpt-4.1': 120000, // ~128k tokens
  'gpt-4.1-mini': 120000, // ~128k tokens
  'gpt-5': 120000, // ~128k tokens
  'o4-mini': 120000, // ~128k tokens
  'claude-3-5-sonnet': 180000, // ~200k tokens
  'claude-sonnet-4': 180000, // ~200k tokens
  'gemini-2.5-flash': 100000, // ~1M tokens (conservative)
  'gemini-2.5-pro': 100000, // ~1M tokens (conservative)
  'deepseek-v3.1': 120000, // ~128k tokens
  'grok-4': 120000, // ~128k tokens
  'llama-3.2-90b': 120000, // ~128k tokens
  'llama-4-scout': 120000, // ~128k tokens
  'llama-4-maverick': 120000, // ~128k tokens
  default: 100000, // Conservative default
} as const;

// Rough token estimation (1 token ≈ 4 characters for English text)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// Intelligent content truncation that preserves important information
function truncateContent(
  content: string,
  maxTokens: number,
): { content: string; truncated: boolean; originalLength: number } {
  const estimatedTokens = estimateTokenCount(content);

  if (estimatedTokens <= maxTokens) {
    return { content, truncated: false, originalLength: content.length };
  }

  // Calculate target character length (rough approximation)
  const targetLength = Math.floor(maxTokens * 4 * 0.9); // Use 90% of limit for safety

  // Try to truncate at sentence boundaries
  const sentences = content.split(/[.!?]+/);
  let truncatedContent = '';
  let currentLength = 0;

  for (const sentence of sentences) {
    const sentenceWithPunctuation =
      sentence.trim() +
      (sentence.endsWith('.') ||
      sentence.endsWith('!') ||
      sentence.endsWith('?')
        ? ''
        : '.');
    const sentenceLength = sentenceWithPunctuation.length;

    if (currentLength + sentenceLength > targetLength) {
      break;
    }

    truncatedContent += (truncatedContent ? ' ' : '') + sentenceWithPunctuation;
    currentLength += sentenceLength;
  }

  // If we couldn't fit any complete sentences, truncate at word boundaries
  if (!truncatedContent) {
    const words = content.split(/\s+/);
    let wordCount = 0;
    const targetWordCount = Math.floor(targetLength / 6); // Rough estimate: 6 chars per word

    for (const word of words) {
      if (wordCount >= targetWordCount) break;
      truncatedContent += (truncatedContent ? ' ' : '') + word;
      wordCount++;
    }
  }

  // If still too long, truncate at character level
  if (truncatedContent.length > targetLength) {
    truncatedContent = truncatedContent.substring(0, targetLength);
  }

  return {
    content:
      truncatedContent +
      (truncatedContent.length < content.length ? '...' : ''),
    truncated: true,
    originalLength: content.length,
  };
}

// RAG search tool for workflow nodes
export const ragSearch = () =>
  tool({
    description:
      'Search through documents in a data pool using semantic similarity',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool to search'),
      query: z.string().describe('Search query'),
      limit: z
        .number()
        .optional()
        .default(5)
        .describe('Maximum number of results to return'),
      threshold: z
        .number()
        .optional()
        .default(0.3)
        .describe('Minimum similarity threshold (0.3 is more lenient)'),
      documentType: z
        .string()
        .optional()
        .describe(
          'Filter by document type (e.g., "main_document", "extracted_image")',
        ),
      fileName: z
        .string()
        .optional()
        .describe('Filter by filename or partial filename'),
      tags: z.array(z.string()).optional().describe('Filter by search tags'),
      maxContextTokens: z
        .number()
        .optional()
        .describe(
          'Maximum tokens to include in context (defaults to model limit)',
        ),
      modelId: z
        .string()
        .optional()
        .describe(
          'Model ID to determine context limits (e.g., "gpt-4.1", "claude-sonnet-4")',
        ),
      truncateStrategy: z
        .enum(['intelligent', 'simple', 'none'])
        .optional()
        .default('intelligent')
        .describe(
          'Strategy for handling large contexts: intelligent (preserve sentences), simple (word boundaries), none (no truncation)',
        ),
    }),
    execute: async ({
      dataPoolId,
      query,
      limit,
      threshold,
      documentType,
      fileName,
      tags,
      maxContextTokens,
      modelId,
      truncateStrategy,
    }) => {
      try {
        console.log('RAG Search: Starting search for data pool:', dataPoolId);
        console.log('RAG Search: Query:', query);

        // Get all documents from the data pool
        const documents = await getDataPoolDocuments({ dataPoolId });
        console.log(
          'RAG Search: Found documents in database:',
          documents.length,
        );

        if (documents.length === 0) {
          console.log('RAG Search: No documents found in data pool');
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Apply metadata filters if provided
        let filteredDocuments = documents;
        if (documentType || fileName || tags) {
          console.log('RAG Search: Applying metadata filters...');

          filteredDocuments = documents.filter((doc) => {
            let matches = true;

            // Filter by document type
            if (
              documentType &&
              (doc.metadata as any)?.documentType !== documentType
            ) {
              matches = false;
            }

            // Filter by filename
            if (
              fileName &&
              (doc.metadata as any)?.fileName &&
              !(doc.metadata as any).fileName
                .toLowerCase()
                .includes(fileName.toLowerCase())
            ) {
              matches = false;
            }

            // Filter by tags
            if (tags && tags.length > 0 && (doc.metadata as any)?.searchTags) {
              const docTags = (doc.metadata as any).searchTags;
              const hasMatchingTag = tags.some((tag) =>
                docTags.some((docTag: string) =>
                  docTag.toLowerCase().includes(tag.toLowerCase()),
                ),
              );
              if (!hasMatchingTag) {
                matches = false;
              }
            }

            return matches;
          });

          console.log(
            `RAG Search: After filtering: ${filteredDocuments.length} documents`,
          );
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
        const scoredDocuments = filteredDocuments
          .map((doc) => {
            console.log(
              'RAG Search: Document:',
              doc.title,
              'has embedding:',
              !!doc.embedding,
            );

            if (!doc.embedding) {
              console.log(
                'RAG Search: Document has no embedding, skipping:',
                doc.title,
              );
              return { ...doc, similarity: 0 };
            }

            const similarity = cosineSimilarityLocal(
              queryEmbedding,
              doc.embedding as number[],
            );

            console.log(
              'RAG Search: Document similarity score:',
              doc.title,
              similarity,
            );

            return { ...doc, similarity };
          })
          .filter((doc) => doc.similarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, limit);

        console.log(
          'RAG Search: Documents above threshold:',
          scoredDocuments.length,
        );

        // Determine context limits
        let contextLimit = maxContextTokens;
        if (!contextLimit && modelId) {
          // Extract model name from modelId (e.g., "gpt-4.1" from "openai/gpt-4.1")
          const modelName =
            modelId.split('/').pop()?.toLowerCase() || 'default';
          contextLimit =
            CONTEXT_LIMITS[modelName as keyof typeof CONTEXT_LIMITS] ||
            CONTEXT_LIMITS.default;
        }
        if (!contextLimit) {
          contextLimit = CONTEXT_LIMITS.default;
        }

        // Calculate total context size and manage truncation
        let totalTokens = 0;
        let truncatedCount = 0;
        const processedResults = [];

        for (const doc of scoredDocuments) {
          const docTokens = estimateTokenCount(doc.content);
          const remainingTokens = contextLimit - totalTokens;

          let processedContent = doc.content;
          let wasTruncated = false;
          let originalLength = doc.content.length;

          // Check if we need to truncate this document
          if (
            truncateStrategy !== 'none' &&
            docTokens > remainingTokens &&
            remainingTokens > 0
          ) {
            const truncationResult = truncateContent(
              doc.content,
              remainingTokens,
            );
            processedContent = truncationResult.content;
            wasTruncated = truncationResult.truncated;
            originalLength = truncationResult.originalLength;

            if (wasTruncated) {
              truncatedCount++;
              console.log(
                `RAG Search: Truncated document "${doc.title}" from ${originalLength} to ${processedContent.length} characters`,
              );
            }
          } else if (docTokens > remainingTokens && remainingTokens <= 0) {
            // Skip this document if we've exceeded the context limit
            console.log(
              `RAG Search: Skipping document "${doc.title}" due to context limit`,
            );
            continue;
          }

          processedResults.push({
            id: doc.id,
            title: doc.title,
            content: processedContent,
            similarity: doc.similarity,
            metadata: doc.metadata,
            truncated: wasTruncated,
            originalLength: originalLength,
            estimatedTokens: estimateTokenCount(processedContent),
          });

          totalTokens += estimateTokenCount(processedContent);
        }

        // Generate warnings if context is large or truncated
        const warnings = [];
        if (totalTokens > contextLimit * 0.8) {
          warnings.push(
            `Large context detected: ${totalTokens} tokens (${Math.round((totalTokens / contextLimit) * 100)}% of limit)`,
          );
        }
        if (truncatedCount > 0) {
          warnings.push(
            `${truncatedCount} document(s) were truncated to fit context limits`,
          );
        }
        if (processedResults.length < scoredDocuments.length) {
          warnings.push(
            `${scoredDocuments.length - processedResults.length} document(s) were skipped due to context limits`,
          );
        }

        return {
          results: processedResults,
          totalDocuments: documents.length,
          filteredDocuments: filteredDocuments.length,
          filteredCount: scoredDocuments.length,
          returnedCount: processedResults.length,
          contextInfo: {
            totalTokens,
            contextLimit,
            truncatedCount,
            skippedCount: scoredDocuments.length - processedResults.length,
            warnings,
          },
          appliedFilters: {
            documentType,
            fileName,
            tags,
          },
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
