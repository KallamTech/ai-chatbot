import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { upstashVectorService } from '@/lib/vector/upstash';
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
  'gemini-2.5-flash': 900000, // ~1M tokens (conservative)
  'gemini-2.5-pro': 900000, // ~1M tokens (conservative)
  'deepseek-v3.1': 120000, // ~128k tokens
  'grok-4': 120000, // ~128k tokens
  'llama-3.2-90b': 120000, // ~128k tokens
  'llama-4-scout': 120000, // ~128k tokens
  'llama-4-maverick': 120000, // ~128k tokens
  default: 1000000, // Conservative default
} as const;

// Rough token estimation (1 token ≈ 4 characters for English text)
function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

// Build SQL-like filter string for Upstash vector search
function buildFilterString(filters: {
  title?: string;
  fileName?: string;
}): string | undefined {
  const conditions: string[] = [];

  if (filters.title) {
    // Filter by document title in metadata
    conditions.push(`title = '${filters.title}'`);
  }

  if (filters.fileName) {
    // Filter by document file name in metadata
    conditions.push(`fileName = '${filters.fileName}'`);
  }

  return conditions.length > 0 ? conditions.join(' AND ') : undefined;
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
      'Search for information within documents using semantic similarity. This tool is best for answering questions or exploring topics by finding relevant document chunks, not for retrieving entire documents. For fetching specific documents by title or filename, use the `directFetch` tool.',
    inputSchema: z.object({
      dataPoolId: z.string().describe('ID of the data pool to search'),
      query: z.string().optional().describe('Search query for semantic search'),
      documentId: z.string().optional().describe('Fetch a specific document by ID'),
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
      fileName: z
        .string()
        .optional()
        .describe('Filter by document file name (partial match)'),
      title: z
        .string()
        .optional()
        .describe('Filter by document title (partial match)'),
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
      searchType: z
        .enum(['semantic', 'keyword', 'hybrid'])
        .optional()
        .default('hybrid')
        .describe(
          'Search type: semantic (vector similarity), keyword (SQL text search), hybrid (combines both)',
        ),
      keywordWeight: z
        .number()
        .optional()
        .default(0.3)
        .describe('Weight for keyword search results in hybrid mode (0-1)'),
      semanticWeight: z
        .number()
        .optional()
        .default(0.7)
        .describe('Weight for semantic search results in hybrid mode (0-1)'),
    }),
    execute: async ({
      dataPoolId,
      query,
      documentId,
      limit,
      threshold,
      fileName,
      title,
      maxContextTokens,
      modelId,
      truncateStrategy,
    }) => {
      if (!query && !documentId) {
        return {
          error: 'Either `query` or `documentId` must be provided.',
        };
      }

      try {
        console.log('RAG Search: Starting search for data pool:', dataPoolId);
        console.log('RAG Search: Query:', query);
        console.log('RAG Search: Parameters:', {
          maxContextTokens,
          modelId,
          limit,
          threshold,
        });

        // Check if the index exists for this datapool
        const indexExists = await upstashVectorService.indexExists(dataPoolId);
        if (!indexExists) {
          console.log('RAG Search: No index found for data pool');
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        // Get document count for reference
        const totalDocuments =
          await upstashVectorService.getDocumentCount(dataPoolId);
        console.log('RAG Search: Total documents in index:', totalDocuments);

        if (totalDocuments === 0) {
          console.log('RAG Search: No documents found in data pool');
          return {
            results: [],
            message: 'No documents found in the data pool',
          };
        }

        let searchResults: any[] = [];

        if (documentId) {
          // Fetch a single document by ID
          const doc = await upstashVectorService.getDocuments(dataPoolId, [documentId]);
          searchResults = doc.map((d) => ({
            id: d.id,
            score: 1,
            metadata: d.metadata,
            content: d.data,
          }));
        } else if (query) {
          // Generate embedding for the query
          const queryEmbedding = await generateEmbedding(query);
          if (!queryEmbedding) {
            return {
              error: 'Failed to generate embedding for query',
            };
          }

          // Build SQL-like filter string for Upstash vector search
          const filterString = buildFilterString({
            title,
            fileName,
          });

          console.log('RAG Search: Using semantic search...');
          if (filterString) {
            console.log('RAG Search: Using filter:', filterString);
          }

          searchResults = await upstashVectorService.searchDocuments(
            dataPoolId,
            queryEmbedding!,
            {
              limit: limit * 2, // Get more results to account for filtering
              filter: filterString,
              includeMetadata: true,
              includeValues: false,
              includeData: true, // Use data field for efficient content retrieval
            },
          );

          console.log(
            'RAG Search: Found documents from semantic search:',
            searchResults.length,
          );
        }

        // Apply threshold and limit
        const scoredDocuments = searchResults
          .filter((result) => result.score >= threshold)
          .sort((a, b) => b.score - a.score)
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

        console.log('RAG Search: Context limit determined:', {
          maxContextTokens,
          modelId,
          contextLimit,
        });

        // Calculate total context size and manage truncation
        let totalTokens = 0;
        let truncatedCount = 0;
        const processedResults = [];

        for (const result of scoredDocuments) {
          const docTokens = estimateTokenCount(result.content);
          const remainingTokens = contextLimit - totalTokens;

          let processedContent = result.content;
          let wasTruncated = false;
          let originalLength = result.content.length;

          // Check if we need to truncate this document
          if (
            truncateStrategy !== 'none' &&
            docTokens > remainingTokens &&
            remainingTokens > 0
          ) {
            const truncationResult = truncateContent(
              result.content,
              remainingTokens,
            );
            processedContent = truncationResult.content;
            wasTruncated = truncationResult.truncated;
            originalLength = truncationResult.originalLength;

            if (wasTruncated) {
              truncatedCount++;
              console.log(
                `RAG Search: Truncated document "${result.metadata?.title || result.id}" from ${originalLength} to ${processedContent.length} characters`,
              );
            }
          } else if (docTokens > remainingTokens && remainingTokens <= 0) {
            // Skip this document if we've exceeded the context limit
            console.log(
              `RAG Search: Skipping document "${result.metadata?.title || result.id}" due to context limit`,
            );
            continue;
          }

          processedResults.push({
            id: result.id,
            title: result.metadata?.title || result.id,
            content: processedContent,
            similarity: result.score,
            metadata: result.metadata,
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
          totalDocuments: totalDocuments,
          filteredDocuments: searchResults.length, // Documents returned by Upstash after server-side filtering
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
            title,
            filterString, // Include the actual filter string used
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
