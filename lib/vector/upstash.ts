import 'server-only';

import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';

// Initialize Upstash clients
const vector = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL ?? '',
  token: process.env.UPSTASH_VECTOR_REST_TOKEN ?? '',
});

// Initialize Redis
const redis = Redis.fromEnv();

export interface VectorDocument {
  id: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
  content: string;
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filter?: string; // SQL-like filter string as per Upstash documentation
  includeMetadata?: boolean;
  includeValues?: boolean;
  includeData?: boolean;
}

export interface PaginationOptions {
  cursor?: number;
  limit?: number;
  includeMetadata?: boolean;
  includeValues?: boolean;
  includeData?: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor?: number;
  hasMore: boolean;
  total?: number;
}

export interface HybridSearchOptions {
  limit?: number;
  threshold?: number;
  filter?: string;
  includeMetadata?: boolean;
  includeValues?: boolean;
  includeData?: boolean;
  // Hybrid search specific options
  keywordWeight?: number; // Weight for keyword search results (0-1)
  semanticWeight?: number; // Weight for semantic search results (0-1)
  combineResults?: boolean; // Whether to combine or return separate results
}

export interface HybridSearchResult {
  id: string;
  score: number;
  metadata: Record<string, any>;
  content: string;
  searchType: 'keyword' | 'semantic' | 'hybrid';
  keywordScore?: number;
  semanticScore?: number;
}

/**
 * Vector database service for managing datapool documents with Upstash
 */
export class UpstashVectorService {
  private vector: Index;
  private redis: Redis;

  constructor() {
    this.vector = vector;
    this.redis = redis;
  }

  /**
   * Create a new namespace for a datapool (Upstash uses namespaces instead of separate indexes)
   */
  async createIndex(dataPoolId: string): Promise<void> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      // Check if namespace already exists
      const existingNamespaces = await this.vector.listNamespaces();
      const namespaceExists = existingNamespaces.some((ns) => ns === namespace);

      if (namespaceExists) {
        console.log(`Namespace ${namespace} already exists`);
        return;
      }

      // Create new namespace by setting it on the vector client
      // In Upstash, namespaces are created automatically when you first use them
      console.log(`Created namespace ${namespace} for datapool ${dataPoolId}`);
    } catch (error) {
      console.error(`Failed to create namespace ${namespace}:`, error);
      throw new Error(`Failed to create namespace for datapool ${dataPoolId}`);
    }
  }

  /**
   * Delete a namespace for a datapool
   */
  async deleteIndex(dataPoolId: string): Promise<void> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      await this.vector.deleteNamespace(namespace);
      console.log(`Deleted namespace ${namespace} for datapool ${dataPoolId}`);
    } catch (error) {
      console.error(`Failed to delete namespace ${namespace}:`, error);
      throw new Error(`Failed to delete namespace for datapool ${dataPoolId}`);
    }
  }

  /**
   * Upsert a document to the vector database
   */
  async upsertDocument(
    dataPoolId: string,
    document: VectorDocument,
  ): Promise<void> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      if (!document.embedding) {
        throw new Error('Document must have an embedding to be upserted');
      }

      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      // Upsert takes an array of vectors
      await namespacedVector.upsert([
        {
          id: document.id,
          vector: document.embedding,
          metadata: {
            ...document.metadata,
            dataPoolId,
          },
          data: document.content, // Store raw text in data field for efficiency
        },
      ] as any); // Type assertion to handle Upstash API types

      console.log(`Upserted document ${document.id} to namespace ${namespace}`);
    } catch (error) {
      console.error(`Failed to upsert document ${document.id}:`, error);
      throw new Error(`Failed to upsert document ${document.id}`);
    }
  }

  /**
   * Delete a document from the vector database
   */
  async deleteDocument(dataPoolId: string, documentId: string): Promise<void> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      // Delete takes an array of IDs
      await namespacedVector.delete([documentId]);

      console.log(`Deleted document ${documentId} from namespace ${namespace}`);
    } catch (error) {
      console.error(`Failed to delete document ${documentId}:`, error);
      throw new Error(`Failed to delete document ${documentId}`);
    }
  }

  /**
   * Search for similar documents in the vector database
   */
  async searchDocuments(
    dataPoolId: string,
    queryEmbedding: number[],
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const namespace = this.getNamespace(dataPoolId);
    const {
      limit = 5,
      filter,
      includeMetadata = true,
      includeValues = false,
      includeData = true,
    } = options;

    // Determine appropriate threshold based on document type
    const getThresholdForDocument = (metadata: Record<string, any>): number => {
      // Check if this is an image document
      if (
        metadata.type === 'extracted_image' ||
        metadata.documentType === 'extracted_image' ||
        metadata.hasExtractedImages ||
        metadata.processedWithOCR
      ) {
        return 0.1; // Lower threshold for images
      }
      return 0.3; // Standard threshold for text documents
    };

    try {
      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      const queryOptions: any = {
        vector: queryEmbedding,
        topK: limit,
        includeMetadata,
        includeVectors: includeValues,
        includeData,
      };

      // Add filter if provided
      if (filter) {
        queryOptions.filter = filter;
      }

      const results = await namespacedVector.query(queryOptions);

      // Filter by document-specific thresholds and format results
      const filteredResults = results
        .filter((result) => {
          const docThreshold = getThresholdForDocument(result.metadata || {});
          return result.score >= docThreshold;
        })
        .map((result) => ({
          id: String(result.id),
          score: result.score,
          metadata: result.metadata || {},
          content:
            (result.data as string) ||
            (result.metadata?.content as string) ||
            '',
        }));

      console.log(
        `Found ${filteredResults.length} documents above document-specific thresholds (0.1 for images, 0.3 for text)`,
      );
      return filteredResults;
    } catch (error) {
      console.error(
        `Failed to search documents in namespace ${namespace}:`,
        error,
      );
      throw new Error(`Failed to search documents in datapool ${dataPoolId}`);
    }
  }

  /**
   * Get all documents from a datapool namespace with pagination support
   */
  async getAllDocuments(
    dataPoolId: string,
    options: PaginationOptions = {},
  ): Promise<PaginatedResult<SearchResult>> {
    const namespace = this.getNamespace(dataPoolId);
    const {
      cursor = 0,
      limit = 100,
      includeMetadata = true,
      includeValues = false,
      includeData = true,
    } = options;

    try {
      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      // Use range to get documents with pagination
      const results = await namespacedVector.range({
        cursor,
        limit,
        includeMetadata,
        includeVectors: includeValues,
        includeData,
      });

      // Handle RangeResult structure - it might have a vectors property
      const vectors = (results as any).vectors || results;
      const documents = vectors.map((result: any) => ({
        id: String(result.id),
        score: 1, // Range results don't have scores
        metadata: result.metadata || {},
        content:
          (result.data as string) || (result.metadata?.content as string) || '',
      }));

      // Determine if there are more documents
      const hasMore = documents.length === limit;
      const nextCursor = hasMore ? cursor + limit : undefined;

      return {
        data: documents,
        nextCursor,
        hasMore,
      };
    } catch (error) {
      console.error(
        `Failed to get documents from namespace ${namespace}:`,
        error,
      );
      throw new Error(`Failed to get documents from datapool ${dataPoolId}`);
    }
  }

  /**
   * Hybrid search combining SQL keyword search with vector semantic search
   */
  async hybridSearch(
    dataPoolId: string,
    query: string,
    queryEmbedding: number[],
    options: HybridSearchOptions = {},
  ): Promise<HybridSearchResult[]> {
    const {
      limit = 10,
      keywordWeight = 0.3,
      semanticWeight = 0.7,
      combineResults = true,
      includeMetadata = true,
      includeData = true,
    } = options;

    // Determine appropriate threshold based on document type
    const getThresholdForDocument = (metadata: Record<string, any>): number => {
      // Check if this is an image document
      if (
        metadata.type === 'extracted_image' ||
        metadata.documentType === 'extracted_image' ||
        metadata.hasExtractedImages ||
        metadata.processedWithOCR
      ) {
        return 0.1; // Lower threshold for images
      }
      return 0.3; // Standard threshold for text documents
    };

    try {
      // Import the SQL search function dynamically to avoid circular dependencies
      const { searchDataPoolDocuments } = await import('@/lib/db/queries');

      // Perform both searches in parallel
      const [keywordResults, semanticResults] = await Promise.all([
        // SQL keyword search
        searchDataPoolDocuments({
          dataPoolId,
          query,
          limit: Math.ceil(limit * 1.5), // Get more results to have better selection
        }),
        // Vector semantic search - use lower threshold to get more results for filtering
        this.searchDocuments(dataPoolId, queryEmbedding, {
          limit: Math.ceil(limit * 1.5),
          threshold: 0.1, // Use lower threshold to capture both text and image results
          includeMetadata,
          includeData,
        }),
      ]);

      if (!combineResults) {
        // Return separate results
        const keywordSearchResults: HybridSearchResult[] = keywordResults.map(
          (doc) => ({
            id: doc.id,
            score: doc.relevanceScore / 10, // Normalize to 0-1 range
            metadata: (doc.metadata as Record<string, any>) || {},
            content: doc.content,
            searchType: 'keyword' as const,
            keywordScore: doc.relevanceScore / 10,
          }),
        );

        const semanticSearchResults: HybridSearchResult[] = semanticResults
          .filter((doc) => {
            const docThreshold = getThresholdForDocument(doc.metadata);
            return doc.score >= docThreshold;
          })
          .map((doc) => ({
            id: doc.id,
            score: doc.score,
            metadata: doc.metadata,
            content: doc.content,
            searchType: 'semantic' as const,
            semanticScore: doc.score,
          }));

        return [...keywordSearchResults, ...semanticSearchResults]
          .sort((a, b) => b.score - a.score)
          .slice(0, limit);
      }

      // Combine results using weighted scoring
      const combinedResults = new Map<string, HybridSearchResult>();

      // Add keyword search results
      keywordResults.forEach((doc) => {
        const normalizedScore = Math.min(doc.relevanceScore / 10, 1); // Normalize to 0-1
        combinedResults.set(doc.id, {
          id: doc.id,
          score: normalizedScore * keywordWeight,
          metadata: (doc.metadata as Record<string, any>) || {},
          content: doc.content,
          searchType: 'hybrid' as const,
          keywordScore: normalizedScore,
        });
      });

      // Add or update with semantic search results (apply document-specific thresholds)
      semanticResults
        .filter((doc) => {
          const docThreshold = getThresholdForDocument(doc.metadata);
          return doc.score >= docThreshold;
        })
        .forEach((doc) => {
          const existing = combinedResults.get(doc.id);
          if (existing) {
            // Combine scores
            existing.score += doc.score * semanticWeight;
            existing.semanticScore = doc.score;
          } else {
            // Add new result
            combinedResults.set(doc.id, {
              id: doc.id,
              score: doc.score * semanticWeight,
              metadata: doc.metadata,
              content: doc.content,
              searchType: 'hybrid' as const,
              semanticScore: doc.score,
            });
          }
        });

      // Convert to array and sort by combined score
      const finalResults = Array.from(combinedResults.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

      console.log(
        `Hybrid search found ${finalResults.length} results (${keywordResults.length} keyword, ${semanticResults.length} semantic)`,
      );
      return finalResults;
    } catch (error) {
      console.error(
        `Failed to perform hybrid search in datapool ${dataPoolId}:`,
        error,
      );
      throw new Error(
        `Failed to perform hybrid search in datapool ${dataPoolId}`,
      );
    }
  }

  /**
   * Get document count for a datapool
   */
  async getDocumentCount(dataPoolId: string): Promise<number> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      // Use range to get all documents and count them
      const results = await namespacedVector.range({
        cursor: 0,
        limit: 1000,
        includeMetadata: false,
        includeVectors: false,
      });

      // Handle RangeResult structure
      const vectors = (results as any).vectors || results;
      return Array.isArray(vectors) ? vectors.length : 0;
    } catch (error) {
      console.error(
        `Failed to get document count for namespace ${namespace}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * Check if a namespace exists for a datapool
   */
  async indexExists(dataPoolId: string): Promise<boolean> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      const namespaces = await this.vector.listNamespaces();
      return namespaces.some((ns) => ns === namespace);
    } catch (error) {
      console.error(`Failed to check if namespace ${namespace} exists:`, error);
      return false;
    }
  }

  /**
   * Get namespace information for a datapool
   */
  async getIndexInfo(dataPoolId: string): Promise<any> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      // Return basic namespace info since info method doesn't exist on namespaced vectors
      return {
        namespace,
        exists: await this.indexExists(dataPoolId),
        documentCount: await this.getDocumentCount(dataPoolId),
      };
    } catch (error) {
      console.error(`Failed to get namespace info for ${namespace}:`, error);
      throw new Error(
        `Failed to get namespace info for datapool ${dataPoolId}`,
      );
    }
  }

  /**
   * Generate namespace name for a datapool
   */
  private getNamespace(dataPoolId: string): string {
    return `datapool-${dataPoolId}`;
  }

  /**
   * Store additional metadata in Redis for faster access
   */
  async storeMetadata(
    dataPoolId: string,
    documentId: string,
    metadata: Record<string, any>,
  ): Promise<void> {
    const key = `datapool:${dataPoolId}:doc:${documentId}:metadata`;

    try {
      await this.redis.hset(key, metadata);
      await this.redis.expire(key, 86400 * 30); // 30 days TTL
    } catch (error) {
      console.error(
        `Failed to store metadata for document ${documentId}:`,
        error,
      );
      // Don't throw error as this is supplementary data
    }
  }

  /**
   * Get metadata from Redis
   */
  async getMetadata(
    dataPoolId: string,
    documentId: string,
  ): Promise<Record<string, any> | null> {
    const key = `datapool:${dataPoolId}:doc:${documentId}:metadata`;

    try {
      const metadata = await this.redis.hgetall(key);
      return metadata && Object.keys(metadata).length > 0 ? metadata : null;
    } catch (error) {
      console.error(
        `Failed to get metadata for document ${documentId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Delete metadata from Redis
   */
  async deleteMetadata(dataPoolId: string, documentId: string): Promise<void> {
    const key = `datapool:${dataPoolId}:doc:${documentId}:metadata`;

    try {
      await this.redis.del(key);
    } catch (error) {
      console.error(
        `Failed to delete metadata for document ${documentId}:`,
        error,
      );
      // Don't throw error as this is supplementary data
    }
  }
}

// Export singleton instance
export const upstashVectorService = new UpstashVectorService();
