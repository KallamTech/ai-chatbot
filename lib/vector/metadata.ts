import 'server-only';

import { upstashVectorService } from './upstash';

/**
 * Utility functions for handling metadata consistency between SQL and Upstash
 */
export const vectorMetadataManager = {
  /**
   * Ensure metadata consistency between SQL and Upstash
   */
  async syncDocumentMetadata(
    dataPoolId: string,
    documentId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    try {
      // Store metadata in Redis for fast access
      await upstashVectorService.storeMetadata(
        dataPoolId,
        documentId,
        metadata,
      );
    } catch (error) {
      console.error(
        `Failed to sync metadata for document ${documentId}:`,
        error,
      );
      // Don't throw error as this is supplementary data
    }
  },

  /**
   * Get metadata from Redis cache
   */
  async getDocumentMetadata(
    dataPoolId: string,
    documentId: string,
  ): Promise<Record<string, any> | null> {
    try {
      return await upstashVectorService.getMetadata(dataPoolId, documentId);
    } catch (error) {
      console.error(
        `Failed to get metadata for document ${documentId}:`,
        error,
      );
      return null;
    }
  },

  /**
   * Delete metadata from Redis cache
   */
  async deleteDocumentMetadata(
    dataPoolId: string,
    documentId: string,
  ): Promise<void> {
    try {
      await upstashVectorService.deleteMetadata(dataPoolId, documentId);
    } catch (error) {
      console.error(
        `Failed to delete metadata for document ${documentId}:`,
        error,
      );
      // Don't throw error as this is supplementary data
    }
  },

  /**
   * Validate and normalize metadata for Upstash storage
   */
  normalizeMetadata(metadata: Record<string, any>): Record<string, any> {
    const normalized: Record<string, any> = {};

    // Copy all metadata fields
    for (const [key, value] of Object.entries(metadata)) {
      // Handle different data types for Upstash compatibility
      if (value === null || value === undefined) {
        continue; // Skip null/undefined values
      }

      if (Array.isArray(value)) {
        // Ensure arrays are properly formatted
        normalized[key] = value.filter(
          (item) => item !== null && item !== undefined,
        );
      } else if (typeof value === 'object') {
        // Handle nested objects
        normalized[key] = vectorMetadataManager.normalizeMetadata(value);
      } else if (typeof value === 'string' && value.length > 1000) {
        // Truncate very long strings to avoid Upstash limits
        normalized[key] = `${value.substring(0, 1000)}...`;
      } else {
        normalized[key] = value;
      }
    }

    return normalized;
  },

  /**
   * Extract searchable tags from metadata
   */
  extractSearchTags(metadata: Record<string, any>): string[] {
    const tags: string[] = [];

    // Add basic document information
    if (metadata.title) {
      tags.push(metadata.title.toLowerCase());
    }

    if (metadata.fileName) {
      tags.push(metadata.fileName.toLowerCase());
      // Add filename without extension
      const nameWithoutExt = metadata.fileName
        .toLowerCase()
        .replace(/\.[^/.]+$/, '');
      if (nameWithoutExt !== metadata.fileName.toLowerCase()) {
        tags.push(nameWithoutExt);
      }
    }

    if (metadata.fileType) {
      tags.push(metadata.fileType.toLowerCase());
    }

    if (metadata.documentType) {
      tags.push(metadata.documentType.toLowerCase());
    }

    if (metadata.language) {
      tags.push(metadata.language.toLowerCase());
    }

    // Add content structure tags
    if (metadata.hasHeadings) tags.push('has-headings');
    if (metadata.hasTables) tags.push('has-tables');
    if (metadata.hasLists) tags.push('has-lists');
    if (metadata.hasCodeBlocks) tags.push('has-code');
    if (metadata.hasFootnotes) tags.push('has-footnotes');
    if (metadata.hasImages) tags.push('has-images');

    // Add content metrics
    if (metadata.wordCount) {
      tags.push(`~${metadata.wordCount} words`);
    }
    if (metadata.estimatedPages) {
      tags.push(`~${metadata.estimatedPages} pages`);
    }
    if (metadata.readabilityScore) {
      const readabilityCategory = Math.round(metadata.readabilityScore / 20);
      tags.push(`readability-${readabilityCategory}`);
    }

    // Add extracted entities (limited to avoid too many tags)
    if (metadata.topics && Array.isArray(metadata.topics)) {
      tags.push(...metadata.topics.slice(0, 5));
    }
    if (metadata.organizations && Array.isArray(metadata.organizations)) {
      tags.push(...metadata.organizations.slice(0, 3));
    }
    if (metadata.people && Array.isArray(metadata.people)) {
      tags.push(...metadata.people.slice(0, 3));
    }
    if (metadata.locations && Array.isArray(metadata.locations)) {
      tags.push(...metadata.locations.slice(0, 3));
    }
    if (metadata.keywords && Array.isArray(metadata.keywords)) {
      tags.push(...metadata.keywords.slice(0, 10));
    }

    // Add processing tags
    if (metadata.processedWithOCR) {
      tags.push('ocr-processed');
    }
    if (metadata.hasExtractedImages) {
      tags.push('contains-images');
    }
    if (metadata.type === 'extracted_image') {
      tags.push('image', 'extracted', 'visual-content');
    }

    // Remove duplicates and filter out empty strings
    return [...new Set(tags.filter((tag) => tag && tag.trim().length > 0))];
  },

  /**
   * Create filter object for Upstash vector search
   */
  createSearchFilter(filters: {
    documentType?: string;
    fileName?: string;
    tags?: string[];
    hasImages?: boolean;
    hasTables?: boolean;
    hasCodeBlocks?: boolean;
    minWordCount?: number;
    maxWordCount?: number;
  }): Record<string, any> {
    const filter: Record<string, any> = {};

    if (filters.documentType) {
      filter.documentType = filters.documentType;
    }

    if (filters.fileName) {
      filter.fileName = filters.fileName;
    }

    if (filters.tags && filters.tags.length > 0) {
      filter.searchTags = filters.tags;
    }

    if (filters.hasImages !== undefined) {
      filter.hasImages = filters.hasImages;
    }

    if (filters.hasTables !== undefined) {
      filter.hasTables = filters.hasTables;
    }

    if (filters.hasCodeBlocks !== undefined) {
      filter.hasCodeBlocks = filters.hasCodeBlocks;
    }

    if (filters.minWordCount !== undefined) {
      filter.minWordCount = filters.minWordCount;
    }

    if (filters.maxWordCount !== undefined) {
      filter.maxWordCount = filters.maxWordCount;
    }

    return filter;
  },

  /**
   * Get document statistics for a datapool
   */
  async getDatapoolStats(dataPoolId: string): Promise<{
    totalDocuments: number;
    documentsWithVectors: number;
    totalWords: number;
    documentTypes: Record<string, number>;
    averageWordCount: number;
    lastUpdated: string | null;
  }> {
    try {
      const indexExists = await upstashVectorService.indexExists(dataPoolId);

      if (!indexExists) {
        return {
          totalDocuments: 0,
          documentsWithVectors: 0,
          totalWords: 0,
          documentTypes: {},
          averageWordCount: 0,
          lastUpdated: null,
        };
      }

      const result = await upstashVectorService.getAllDocuments(dataPoolId, {
        limit: 1000,
      });
      const vectorDocuments = result.data;

      let totalWords = 0;
      const documentTypes: Record<string, number> = {};
      let lastUpdated: string | null = null;

      for (const doc of vectorDocuments) {
        const metadata = doc.metadata;

        if (metadata.wordCount) {
          totalWords += metadata.wordCount;
        }

        if (metadata.documentType) {
          documentTypes[metadata.documentType] =
            (documentTypes[metadata.documentType] || 0) + 1;
        }

        if (metadata.createdAt) {
          const docDate = new Date(metadata.createdAt);
          if (!lastUpdated || docDate > new Date(lastUpdated)) {
            lastUpdated = metadata.createdAt;
          }
        }
      }

      const averageWordCount =
        vectorDocuments.length > 0 ? totalWords / vectorDocuments.length : 0;

      return {
        totalDocuments: vectorDocuments.length,
        documentsWithVectors: vectorDocuments.length,
        totalWords,
        documentTypes,
        averageWordCount: Math.round(averageWordCount),
        lastUpdated,
      };
    } catch (error) {
      console.error(`Failed to get datapool stats for ${dataPoolId}:`, error);
      return {
        totalDocuments: 0,
        documentsWithVectors: 0,
        totalWords: 0,
        documentTypes: {},
        averageWordCount: 0,
        lastUpdated: null,
      };
    }
  },
};
