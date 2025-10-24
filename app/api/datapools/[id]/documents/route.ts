import { auth } from '@/app/(auth)/auth';
import {
  createDataPoolDocument,
  deleteDataPoolDocument,
  getDataPoolById,
} from '@/lib/db/queries';
import { generateDocumentEmbedding } from '@/lib/utils';
import { upstashVectorService } from '@/lib/vector/upstash';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import {
  processPdfWithMistralOCR,
  isPdfFile,
  processExtractedImages,
} from '@/lib/utils/pdf-processor';
import { analyzeDocumentContent } from '@/lib/utils/document-analyzer';
import {
  getSupportedFileTypes,
  getSupportedFileExtensions,
  isPdfProcessingAvailable,
} from '@/lib/utils/pdf-config';
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: dataPoolId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    // Verify the data pool exists and belongs to the user
    const dataPool = await getDataPoolById({
      id: dataPoolId,
      userId: session.user.id,
    });

    if (!dataPool) {
      return new ChatSDKError('not_found:database').toResponse();
    }

    // Check if the index exists for this datapool
    const indexExists = await upstashVectorService.indexExists(dataPoolId);

    if (!indexExists) {
      return NextResponse.json({
        documents: [],
        pagination: {
          hasMore: false,
          nextCursor: undefined,
        },
      });
    }

    // Parse pagination parameters from query string
    const url = new URL(request.url);
    const cursor = Number.parseInt(url.searchParams.get('cursor') || '0', 10);
    const limit = Math.min(
      Number.parseInt(url.searchParams.get('limit') || '50', 10),
      200,
    ); // Max 200 per page

    // Get documents from Upstash vector database with pagination
    const result = await upstashVectorService.getAllDocuments(dataPoolId, {
      cursor,
      limit,
      includeMetadata: true,
      includeData: true,
    });

    // Convert to the expected format
    const documents = result.data.map((doc) => ({
      id: doc.id,
      dataPoolId: dataPoolId,
      title: doc.metadata?.title || doc.id,
      content: doc.content,
      metadata: doc.metadata,
      createdAt: doc.metadata?.createdAt
        ? new Date(doc.metadata.createdAt)
        : new Date(),
    }));

    return NextResponse.json({
      documents,
      pagination: {
        hasMore: result.hasMore,
        nextCursor: result.nextCursor,
      },
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error fetching documents:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: dataPoolId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    // Verify the data pool exists and belongs to the user
    const dataPool = await getDataPoolById({
      id: dataPoolId,
      userId: session.user.id,
    });

    if (!dataPool) {
      return new ChatSDKError('not_found:database').toResponse();
    }

    console.log('Data pool found:', dataPool.id, dataPool.name);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file size (limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size too large. Maximum allowed size is 10MB.' },
        { status: 400 },
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: 'Document title is required' },
        { status: 400 },
      );
    }

    // Validate file type - allow text files and PDFs (if PDF processing is available)
    const allowedTypes = getSupportedFileTypes();
    const fileType = file.type || 'text/plain';
    const fileName = file.name.toLowerCase();

    // Check file extension as backup
    const allowedExtensions = getSupportedFileExtensions();
    const hasAllowedExtension = allowedExtensions.some((ext) =>
      fileName.endsWith(ext),
    );

    if (!allowedTypes.includes(fileType) && !hasAllowedExtension) {
      const supportedFormats = allowedExtensions.join(', ');
      return NextResponse.json(
        {
          error: `Unsupported file type. Supported formats: ${supportedFormats}`,
        },
        { status: 400 },
      );
    }

    // Additional check for PDF files when PDF processing is not available
    if (isPdfFile(file) && !isPdfProcessingAvailable()) {
      return NextResponse.json(
        {
          error:
            'PDF processing is not available. Please configure MISTRAL_API_KEY environment variable.',
        },
        { status: 400 },
      );
    }

    // Process file content based on type
    let content: string;
    let extractedImages:
      | Array<{ base64: string; description?: string; embedding?: number[] }>
      | undefined;
    let embedding: number[] | undefined;
    let pdfResult: any = undefined;

    if (isPdfFile(file)) {
      // Handle PDF files with Mistral OCR
      console.log('Processing PDF file with Mistral OCR...');
      pdfResult = await processPdfWithMistralOCR(file);

      if (!pdfResult.success) {
        return NextResponse.json(
          { error: pdfResult.error || 'Failed to process PDF file' },
          { status: 400 },
        );
      }

      content = pdfResult.content || '';
      embedding = pdfResult.embedding;

      // Process extracted images if any
      if (pdfResult.images && pdfResult.images.length > 0) {
        extractedImages = await processExtractedImages(pdfResult.images);
      }
    } else {
      // Handle text files
      try {
        content = await file.text();
      } catch (error) {
        return NextResponse.json(
          {
            error:
              "Failed to read file content. Make sure it's a valid text file.",
          },
          { status: 400 },
        );
      }

      if (!content.trim()) {
        return NextResponse.json(
          { error: 'File content is empty' },
          { status: 400 },
        );
      }

      // Remove null bytes and other problematic characters for PostgreSQL
      content = content
        .replace(/\0/g, '')
        .replace(
          // eslint-disable-next-line no-control-regex
          /[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F\\x7F]/g,
          '',
        );
    }

    if (!content.trim()) {
      return NextResponse.json(
        { error: 'File contains only invalid characters' },
        { status: 400 },
      );
    }

    // Generate embedding for text files (PDFs already have embeddings generated)
    if (!isPdfFile(file)) {
      try {
        embedding = await generateDocumentEmbedding(content);
        console.log(
          'Generated embedding for text file:',
          embedding ? 'success' : 'failed',
        );
      } catch (error) {
        console.error('Error generating embedding:', error);
        embedding = undefined;
      }
    }

    // Perform comprehensive document analysis
    const documentAnalysis = analyzeDocumentContent(
      content,
      file.name,
      file.type || 'text/plain',
      isPdfFile(file) ? pdfResult : undefined,
    );

    // Ensure the index exists for this datapool
    const indexExists = await upstashVectorService.indexExists(dataPool.id);
    if (!indexExists) {
      await upstashVectorService.createIndex(dataPool.id);
    }

    // Generate a unique document ID
    const documentId = crypto.randomUUID();

    // Prepare metadata for the document
    const documentMetadata = {
      // File information
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type || 'text/plain',
      uploadedAt: new Date().toISOString(),
      title: title,
      createdAt: new Date().toISOString(),

      // Basic content metrics
      contentLength: documentAnalysis.contentLength,
      wordCount: documentAnalysis.wordCount,
      characterCount: documentAnalysis.characterCount,
      lineCount: documentAnalysis.lineCount,
      paragraphCount: documentAnalysis.paragraphCount,
      sentenceCount: documentAnalysis.sentenceCount,
      estimatedPages: documentAnalysis.estimatedPages,

      // Document structure
      hasHeadings: documentAnalysis.hasHeadings,
      headingCount: documentAnalysis.headingCount,
      headingLevels: documentAnalysis.headingLevels,
      hasLists: documentAnalysis.hasLists,
      listCount: documentAnalysis.listCount,
      hasTables: documentAnalysis.hasTables,
      tableCount: documentAnalysis.tableCount,
      hasCodeBlocks: documentAnalysis.hasCodeBlocks,
      codeBlockCount: documentAnalysis.codeBlockCount,

      // Content analysis
      documentType: documentAnalysis.documentType,
      language: documentAnalysis.language,
      readabilityScore: documentAnalysis.readabilityScore,
      averageWordsPerSentence: documentAnalysis.averageWordsPerSentence,
      averageSyllablesPerWord: documentAnalysis.averageSyllablesPerWord,

      // Entity extraction
      dates: documentAnalysis.dates,
      emails: documentAnalysis.emails,
      urls: documentAnalysis.urls,
      phoneNumbers: documentAnalysis.phoneNumbers,
      organizations: documentAnalysis.organizations,
      people: documentAnalysis.people,
      locations: documentAnalysis.locations,

      // Topics and keywords
      topics: documentAnalysis.topics,
      keywords: documentAnalysis.keywords,
      keyPhrases: documentAnalysis.keyPhrases,

      // File-specific metadata
      hasImages: documentAnalysis.hasImages,
      imageCount: documentAnalysis.imageCount,
      hasFootnotes: documentAnalysis.hasFootnotes,
      footnoteCount: documentAnalysis.footnoteCount,

      // Document type and processing info
      processingStatus: 'completed',

      // OCR processing info (for PDFs)
      ...(isPdfFile(file) && {
        processedWithOCR: true,
        ocrProvider: 'mistral',
        hasExtractedImages: extractedImages && extractedImages.length > 0,
        extractedImagesCount: extractedImages?.length || 0,
        ocrMetadata: documentAnalysis.ocrMetadata,
      }),

      // Extracted images info
      ...(extractedImages &&
        extractedImages.length > 0 && {
          extractedImages: extractedImages.map((img) => ({
            description: img.description,
            hasEmbedding: !!img.embedding,
          })),
        }),

      // Enhanced searchable tags for better retrieval
      searchTags: [
        title.toLowerCase(),
        file.name
          .toLowerCase()
          .replace(/\.[^/.]+$/, ''), // filename without extension
        file.type || 'text',
        documentAnalysis.documentType,
        documentAnalysis.language,
        ...(isPdfFile(file) ? ['pdf', 'ocr-processed'] : []),
        ...(extractedImages && extractedImages.length > 0
          ? ['contains-images']
          : []),
        ...(documentAnalysis.hasHeadings ? ['has-headings'] : []),
        ...(documentAnalysis.hasTables ? ['has-tables'] : []),
        ...(documentAnalysis.hasLists ? ['has-lists'] : []),
        ...(documentAnalysis.hasCodeBlocks ? ['has-code'] : []),
        ...(documentAnalysis.hasFootnotes ? ['has-footnotes'] : []),
        ...documentAnalysis.topics,
        ...documentAnalysis.organizations.slice(0, 5), // Top 5 organizations
        ...documentAnalysis.people.slice(0, 5), // Top 5 people
        ...documentAnalysis.locations.slice(0, 5), // Top 5 locations
        ...documentAnalysis.keywords.slice(0, 10), // Top 10 keywords
        `~${documentAnalysis.wordCount} words`,
        `~${documentAnalysis.estimatedPages} pages`,
        `readability-${Math.round(documentAnalysis.readabilityScore / 20)}`, // Rough readability category
      ],
    };

    // Store the document in Upstash vector database
    if (embedding) {
      await upstashVectorService.upsertDocument(dataPool.id, {
        id: documentId,
        content: content,
        embedding: embedding,
        metadata: documentMetadata,
      });
    }

    // Also store in SQL database for metadata and non-vector operations
    const document = await createDataPoolDocument({
      dataPoolId: dataPool.id,
      title,
      content,
      metadata: documentMetadata,
    });

    // Create separate documents for each extracted image so they can be individually searched
    const imageDocuments = [];
    if (extractedImages && extractedImages.length > 0) {
      for (let i = 0; i < extractedImages.length; i++) {
        const image = extractedImages[i];
        if (image.embedding) {
          try {
            const imageTitle = `${title} - Image ${i + 1}${image.description ? `: ${image.description}` : ''}`;
            const imageContent =
              image.description || `Image extracted from ${title}`;
            const imageDocumentId = crypto.randomUUID();

            const imageMetadata = {
              // Image identification
              type: 'extracted_image',
              documentType: 'extracted_image',
              processingStatus: 'completed',

              // Source document reference
              sourceDocument: documentId,
              sourceDocumentTitle: title,
              imageIndex: i,

              // Image content
              description: image.description,
              hasEmbedding: true,
              extractedAt: new Date().toISOString(),
              title: imageTitle,
              createdAt: new Date().toISOString(),

              // Searchable tags
              searchTags: [
                'image',
                'extracted',
                'from-pdf',
                image.description?.toLowerCase() || 'no-description',
                title.toLowerCase(),
                `image-${i + 1}`,
                'visual-content',
              ],
            };

            // Store image document in Upstash vector database
            await upstashVectorService.upsertDocument(dataPool.id, {
              id: imageDocumentId,
              content: imageContent,
              embedding: image.embedding,
              metadata: imageMetadata,
            });

            // Also store in SQL database for metadata
            const imageDocument = await createDataPoolDocument({
              dataPoolId: dataPool.id,
              title: imageTitle,
              content: imageContent,
              metadata: imageMetadata,
            });

            imageDocuments.push(imageDocument);
            console.log(`Created image document ${i + 1}:`, imageDocument.id);
          } catch (error) {
            console.error(`Failed to create image document ${i + 1}:`, error);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        metadata: document.metadata,
      },
      ...(isPdfFile(file) && {
        ocrProcessing: {
          provider: 'mistral',
          extractedImagesCount: extractedImages?.length || 0,
          hasEmbedding: !!embedding,
          imageDocumentsCreated: imageDocuments.length,
        },
      }),
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: dataPoolId } = await params;
    const url = new URL(request.url);
    const documentId = url.searchParams.get('documentId');
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    if (!documentId) {
      return new ChatSDKError(
        'bad_request:database',
        'Document ID is required',
      ).toResponse();
    }

    // Verify the data pool exists and belongs to the user
    const dataPool = await getDataPoolById({
      id: dataPoolId,
      userId: session.user.id,
    });

    if (!dataPool) {
      return new ChatSDKError('not_found:database').toResponse();
    }

    // Delete from SQL database
    await deleteDataPoolDocument({
      id: documentId,
      dataPoolId,
    });

    // Also delete from Upstash vector database
    try {
      await upstashVectorService.deleteDocument(dataPoolId, documentId);
    } catch (error) {
      console.error('Failed to delete document from Upstash:', error);
      // Don't fail the request if Upstash deletion fails
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error deleting document:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}
