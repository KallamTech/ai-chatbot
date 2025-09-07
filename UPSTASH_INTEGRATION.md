# Upstash Vector Database Integration

This document describes the integration of Upstash vector database for datapool document storage and retrieval.

## Overview

The system now uses Upstash vector database for:
- Storing document embeddings and metadata
- Performing semantic similarity searches
- Managing vector indices for each datapool

SQL database is still used for:
- Datapool metadata and relationships
- Document metadata (non-vector)
- User management and authentication
- Document content and basic information

**Note**: Embeddings are no longer stored in the SQL database - they are exclusively managed by Upstash vector database.

## Environment Variables

Add the following environment variables to your `.env.local` file:

```bash
# Upstash Vector Database
UPSTASH_VECTOR_REST_URL="https://your-vector-endpoint.upstash.io"
UPSTASH_VECTOR_REST_TOKEN="your-vector-token"

# Upstash Redis (for metadata caching)
UPSTASH_REDIS_REST_URL="https://your-redis-endpoint.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-redis-token"
```

## Architecture

### Vector Service (`lib/vector/upstash.ts`)
- `UpstashVectorService`: Main service class for vector operations
- Index management (create, delete, check existence)
- Document operations (upsert, delete, search)
- Metadata caching with Redis

### Metadata Manager (`lib/vector/metadata.ts`)
- `VectorMetadataManager`: Utility class for metadata handling
- Metadata normalization and validation
- Search tag extraction
- Filter creation for vector searches
- Datapool statistics

### Key Features

1. **Automatic Index Creation**: Each datapool gets its own vector index
2. **Hybrid Storage**: Documents stored in both SQL (metadata) and Upstash (vectors)
3. **Metadata Caching**: Redis used for fast metadata access
4. **Search Filtering**: Support for metadata-based filtering in vector searches
5. **Error Handling**: Graceful fallbacks when Upstash is unavailable

## API Changes

### Document Upload (`app/api/datapools/[id]/documents/route.ts`)
- Creates Upstash index if it doesn't exist
- Stores document content and metadata in SQL
- Stores document embeddings and metadata in Upstash
- Handles extracted images as separate vector documents

### Document Retrieval (`app/api/datapools/[id]/documents/route.ts`)
- GET endpoint now retrieves from Upstash vector database
- Maintains backward compatibility with SQL-only approach

### RAG Search (`lib/ai/tools/rag-search.ts`)
- Uses Upstash vector search instead of local similarity calculation
- Supports metadata filtering
- Maintains all existing search features

### Datapool Management
- Creation: Automatically creates Upstash index
- Deletion: Removes both SQL data and Upstash index

## Migration Notes

### Existing Data
- Existing documents in SQL database will continue to work
- New documents will be stored in both SQL (content/metadata) and Upstash (embeddings)
- RAG search will use Upstash when available, fallback to SQL
- **Migration**: The embedding column has been removed from the SQL database schema

### Performance
- Vector searches are now performed by Upstash (faster and more scalable)
- Metadata caching reduces Redis lookups
- SQL database load reduced for vector operations

## Error Handling

The system is designed to be resilient:
- If Upstash is unavailable, operations fall back to SQL-only mode
- Index creation failures don't prevent datapool creation
- Document operations continue even if vector operations fail

## Monitoring

Key metrics to monitor:
- Upstash API response times
- Index creation/deletion success rates
- Vector search performance
- Metadata cache hit rates

## Troubleshooting

### Common Issues

1. **Index Creation Fails**
   - Check Upstash credentials
   - Verify API limits and quotas
   - Check network connectivity

2. **Vector Search Returns No Results**
   - Verify index exists for the datapool
   - Check if documents have embeddings
   - Verify search threshold settings

3. **Metadata Inconsistency**
   - Check Redis connectivity
   - Verify metadata normalization
   - Check for data type compatibility

### Debug Commands

```typescript
// Check if index exists
const exists = await upstashVectorService.indexExists(dataPoolId);

// Get index info
const info = await upstashVectorService.getIndexInfo(dataPoolId);

// Get document count
const count = await upstashVectorService.getDocumentCount(dataPoolId);

// Get all documents
const docs = await upstashVectorService.getAllDocuments(dataPoolId);
```

## Future Enhancements

1. **Batch Operations**: Support for bulk document operations
2. **Index Optimization**: Automatic index tuning based on usage patterns
3. **Advanced Filtering**: More sophisticated metadata filtering options
4. **Analytics**: Detailed usage analytics and performance metrics
5. **Backup/Restore**: Automated backup and restore procedures
