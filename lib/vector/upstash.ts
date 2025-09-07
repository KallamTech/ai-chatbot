import 'server-only';

import { Index } from '@upstash/vector';
import { Redis } from '@upstash/redis';

// Initialize Upstash clients
const vector = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL!,
  token: process.env.UPSTASH_VECTOR_REST_TOKEN!,
});

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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
  filter?: Record<string, any>;
  includeMetadata?: boolean;
  includeValues?: boolean;
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
      const namespaceExists = existingNamespaces.some(ns => ns === namespace);

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
    document: VectorDocument
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
            content: document.content,
            dataPoolId,
          },
        },
      ]);

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
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const namespace = this.getNamespace(dataPoolId);
    const {
      limit = 5,
      threshold = 0.3,
      filter = {},
      includeMetadata = true,
      includeValues = false,
    } = options;

    try {
      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      const results = await namespacedVector.query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata,
        includeVectors: includeValues,
      });

      // Filter by threshold and format results
      const filteredResults = results
        .filter(result => result.score >= threshold)
        .map(result => ({
          id: String(result.id),
          score: result.score,
          metadata: result.metadata || {},
          content: (result.metadata?.content as string) || '',
        }));

      console.log(`Found ${filteredResults.length} documents above threshold ${threshold}`);
      return filteredResults;
    } catch (error) {
      console.error(`Failed to search documents in namespace ${namespace}:`, error);
      throw new Error(`Failed to search documents in datapool ${dataPoolId}`);
    }
  }

  /**
   * Get all documents from a datapool namespace
   */
  async getAllDocuments(dataPoolId: string): Promise<SearchResult[]> {
    const namespace = this.getNamespace(dataPoolId);

    try {
      // Get the namespaced vector client
      const namespacedVector = this.vector.namespace(namespace);

      // Use range to get all documents
      const results = await namespacedVector.range({
        cursor: 0, // Start from the beginning
        limit: 1000, // Adjust based on your needs
        includeMetadata: true,
        includeVectors: false,
      });

      // Handle RangeResult structure - it might have a vectors property
      const vectors = (results as any).vectors || results;
      return vectors.map((result: any) => ({
        id: String(result.id),
        score: 1, // Range results don't have scores
        metadata: result.metadata || {},
        content: (result.metadata?.content as string) || '',
      }));
    } catch (error) {
      console.error(`Failed to get all documents from namespace ${namespace}:`, error);
      throw new Error(`Failed to get documents from datapool ${dataPoolId}`);
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
      console.error(`Failed to get document count for namespace ${namespace}:`, error);
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
      return namespaces.some(ns => ns === namespace);
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
      throw new Error(`Failed to get namespace info for datapool ${dataPoolId}`);
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
  async storeMetadata(dataPoolId: string, documentId: string, metadata: Record<string, any>): Promise<void> {
    const key = `datapool:${dataPoolId}:doc:${documentId}:metadata`;

    try {
      await this.redis.hset(key, metadata);
      await this.redis.expire(key, 86400 * 30); // 30 days TTL
    } catch (error) {
      console.error(`Failed to store metadata for document ${documentId}:`, error);
      // Don't throw error as this is supplementary data
    }
  }

  /**
   * Get metadata from Redis
   */
  async getMetadata(dataPoolId: string, documentId: string): Promise<Record<string, any> | null> {
    const key = `datapool:${dataPoolId}:doc:${documentId}:metadata`;

    try {
      const metadata = await this.redis.hgetall(key);
      return metadata && Object.keys(metadata).length > 0 ? metadata : null;
    } catch (error) {
      console.error(`Failed to get metadata for document ${documentId}:`, error);
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
      console.error(`Failed to delete metadata for document ${documentId}:`, error);
      // Don't throw error as this is supplementary data
    }
  }
}

// Export singleton instance
export const upstashVectorService = new UpstashVectorService();