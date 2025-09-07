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
        const totalDocuments = await upstashVectorService.getDocumentCount(dataPoolId);
        console.log('RAG Search: Total documents in index:', totalDocuments);

        if (totalDocuments === 0) {
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

        // Build filter for Upstash vector search
        const filter: Record<string, any> = {};
        if (documentType) {
          filter.documentType = documentType;
        }
        if (fileName) {
          filter.fileName = fileName;
        }
        if (tags && tags.length > 0) {
          filter.searchTags = tags;
        }

        // Search using Upstash vector database
        console.log('RAG Search: Searching with Upstash vector database...');
        const searchResults = await upstashVectorService.searchDocuments(
          dataPoolId,
          queryEmbedding,
          {
            limit: limit * 2, // Get more results to account for filtering
            threshold: 0.1, // Lower threshold for initial search
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            includeMetadata: true,
            includeValues: false,
          }
        );

        console.log('RAG Search: Found documents from vector search:', searchResults.length);

        // Apply additional client-side filtering if needed
        let filteredResults = searchResults;
        if (fileName || tags) {
          console.log('RAG Search: Applying additional metadata filters...');

          filteredResults = searchResults.filter((result) => {
            let matches = true;

            // Filter by filename (partial match)
            if (fileName && result.metadata?.fileName) {
              if (!result.metadata.fileName.toLowerCase().includes(fileName.toLowerCase())) {
                matches = false;
              }
            }

            // Filter by tags
            if (tags && tags.length > 0 && result.metadata?.searchTags) {
              const docTags = result.metadata.searchTags;
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
            `RAG Search: After additional filtering: ${filteredResults.length} documents`,
          );
        }

        // Apply threshold and limit
        const scoredDocuments = filteredResults
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
          filteredDocuments: searchResults.length,
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

