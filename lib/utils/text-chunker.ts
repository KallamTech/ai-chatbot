/**
 * Text chunking utilities for splitting documents into smaller, manageable pieces
 * for embedding and vector storage
 */

export interface TextChunk {
  id: string;
  content: string;
  chunkIndex: number;
  totalChunks: number;
  metadata: {
    startPosition: number;
    endPosition: number;
    estimatedPageNumber: number;
    wordCount: number;
    characterCount: number;
  };
}

export interface ChunkingOptions {
  /** Maximum characters per chunk (default: 2000 - approximately 1 page) */
  maxCharsPerChunk?: number;
}

const DEFAULT_CHUNKING_OPTIONS: Required<ChunkingOptions> = {
  maxCharsPerChunk: 5000, // ~1 page of text
};

/**
 * Split text into chunks of approximately one page each
 */
export function chunkText(
  text: string,
  baseId: string,
  options: ChunkingOptions = {},
): TextChunk[] {
  const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options };

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: TextChunk[] = [];
  let currentPosition = 0;
  let chunkIndex = 0;

  while (currentPosition < text.length) {
    // Simple chunking: just take maxCharsPerChunk characters
    const chunkEnd = Math.min(
      currentPosition + opts.maxCharsPerChunk,
      text.length,
    );
    const chunkContent = text.slice(currentPosition, chunkEnd).trim();

    if (chunkContent.length > 0) {
      const wordCount = chunkContent
        .split(/\s+/)
        .filter((w) => w.length > 0).length;
      const estimatedPageNumber = chunkIndex + 1;

      chunks.push({
        id: `${baseId}-chunk-${chunkIndex}`,
        content: chunkContent,
        chunkIndex,
        totalChunks: 0, // Will be updated after all chunks are created
        metadata: {
          startPosition: currentPosition,
          endPosition: chunkEnd,
          estimatedPageNumber,
          wordCount,
          characterCount: chunkContent.length,
        },
      });

      chunkIndex++;
    }

    // Move to next chunk position (no overlap)
    currentPosition = chunkEnd;
  }

  // Update total chunks count for all chunks
  chunks.forEach((chunk) => {
    chunk.totalChunks = chunks.length;
  });

  return chunks;
}

/**
 * Chunk text specifically for PDF pages when page information is available
 */
export function chunkPdfByPages(
  pages: Array<{ text: string; pageNumber?: number }>,
  baseId: string,
  options: ChunkingOptions = {},
): TextChunk[] {
  const opts = { ...DEFAULT_CHUNKING_OPTIONS, ...options };
  const chunks: TextChunk[] = [];
  let globalChunkIndex = 0;

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const page = pages[pageIndex];
    const pageNumber = page.pageNumber || pageIndex + 1;

    if (!page.text || page.text.trim().length === 0) {
      continue;
    }

    // If page text is small enough, create a single chunk
    if (page.text.length <= opts.maxCharsPerChunk) {
      const wordCount = page.text
        .split(/\s+/)
        .filter((w) => w.length > 0).length;

      chunks.push({
        id: `${baseId}-page-${pageNumber}-chunk-0`,
        content: page.text.trim(),
        chunkIndex: globalChunkIndex,
        totalChunks: 0, // Will be updated later
        metadata: {
          startPosition: 0,
          endPosition: page.text.length,
          estimatedPageNumber: pageNumber,
          wordCount,
          characterCount: page.text.length,
        },
      });

      globalChunkIndex++;
    } else {
      // Split large page into multiple chunks
      const pageChunks = chunkText(
        page.text,
        `${baseId}-page-${pageNumber}`,
        opts,
      );

      for (const pageChunk of pageChunks) {
        chunks.push({
          ...pageChunk,
          id: `${baseId}-page-${pageNumber}-chunk-${pageChunk.chunkIndex}`,
          chunkIndex: globalChunkIndex,
          metadata: {
            ...pageChunk.metadata,
            estimatedPageNumber: pageNumber,
          },
        });

        globalChunkIndex++;
      }
    }
  }

  // Update total chunks count
  chunks.forEach((chunk) => {
    chunk.totalChunks = chunks.length;
  });

  return chunks;
}

/**
 * Estimate reading time for a chunk (in minutes)
 */
export function estimateReadingTime(chunk: TextChunk): number {
  // Average reading speed: 200-250 words per minute
  const wordsPerMinute = 225;
  return Math.max(
    0.5,
    Math.round((chunk.metadata.wordCount / wordsPerMinute) * 10) / 10,
  );
}

/**
 * Get chunk summary for metadata
 */
export function getChunkSummary(chunk: TextChunk): string {
  const preview = chunk.content.slice(0, 100);
  const readingTime = estimateReadingTime(chunk);

  return `Chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} (Page ~${chunk.metadata.estimatedPageNumber}) - ${chunk.metadata.wordCount} words, ~${readingTime}min read: ${preview}${chunk.content.length > 100 ? '...' : ''}`;
}
