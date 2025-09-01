import { auth } from '@/app/(auth)/auth';
import {
  getDataPoolDocuments,
  createDataPoolDocument,
  deleteDataPoolDocument,
  getDataPoolById,
} from '@/lib/db/queries';
import { generateDocumentEmbedding } from '@/lib/utils';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import {
  processPdfWithMistralOCR,
  isPdfFile,
  processExtractedImages,
} from '@/lib/utils/pdf-processor';
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

    const documents = await getDataPoolDocuments({
      dataPoolId,
    });

    const documentsWithoutEmbeddings = documents.map((doc) => ({
      ...doc,
      embedding: undefined, // Don't send embeddings to client
    }));

    return NextResponse.json({
      documents: documentsWithoutEmbeddings,
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

    if (isPdfFile(file)) {
      // Handle PDF files with Mistral OCR
      console.log('Processing PDF file with Mistral OCR...');
      const pdfResult = await processPdfWithMistralOCR(file);

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
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
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

    // Extract additional metadata for better searchability
    const contentLength = content.length;
    const wordCount = content
      .split(/\s+/)
      .filter((word) => word.length > 0).length;
    const estimatedPages = Math.ceil(contentLength / 2000); // Rough estimate: 2000 chars per page

    // Create the main document
    const document = await createDataPoolDocument({
      dataPoolId: dataPool.id,
      title,
      content,
      embedding,
      metadata: {
        // File information
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'text/plain',
        uploadedAt: new Date().toISOString(),

        // Content analysis
        contentLength,
        wordCount,
        estimatedPages,

        // Document type and processing info
        documentType: 'main_document',
        processingStatus: 'completed',

        // OCR processing info (for PDFs)
        ...(isPdfFile(file) && {
          processedWithOCR: true,
          ocrProvider: 'mistral',
          hasExtractedImages: extractedImages && extractedImages.length > 0,
          extractedImagesCount: extractedImages?.length || 0,
        }),

        // Extracted images info
        ...(extractedImages &&
          extractedImages.length > 0 && {
            extractedImages: extractedImages.map((img) => ({
              description: img.description,
              hasEmbedding: !!img.embedding,
            })),
          }),

        // Searchable tags for better retrieval
        searchTags: [
          title.toLowerCase(),
          file.name
            .toLowerCase()
            .replace(/\.[^/.]+$/, ''), // filename without extension
          file.type || 'text',
          ...(isPdfFile(file) ? ['pdf', 'ocr-processed'] : []),
          ...(extractedImages && extractedImages.length > 0
            ? ['contains-images']
            : []),
          `~${wordCount} words`,
          `~${estimatedPages} pages`,
        ],
      },
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

            const imageDocument = await createDataPoolDocument({
              dataPoolId: dataPool.id,
              title: imageTitle,
              content: imageContent,
              embedding: image.embedding,
              metadata: {
                // Image identification
                type: 'extracted_image',
                documentType: 'extracted_image',
                processingStatus: 'completed',

                // Source document reference
                sourceDocument: document.id,
                sourceDocumentTitle: title,
                imageIndex: i,

                // Image content
                description: image.description,
                hasEmbedding: true,
                extractedAt: new Date().toISOString(),

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
              },
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

    await deleteDataPoolDocument({
      id: documentId,
      dataPoolId,
    });

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
