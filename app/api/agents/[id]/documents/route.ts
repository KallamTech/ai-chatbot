import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import {
  getAgentById,
  getDataPoolByAgentId,
  createDataPoolDocument,
  getDataPoolDocuments,
  deleteDataPoolDocument
} from '@/lib/db/queries';
import { generateDocumentEmbedding } from '@/lib/utils';
import { ChatSDKError } from '@/lib/errors';
import { processPdfWithMistralOCR, isPdfFile, processExtractedImages } from '@/lib/utils/pdf-processor';
import { getSupportedFileTypes, getSupportedFileExtensions, isPdfProcessingAvailable } from '@/lib/utils/pdf-config';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:agent').toResponse();
    }

    // Verify agent exists and belongs to user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // Get the data pool for this agent
    const dataPool = await getDataPoolByAgentId({ agentId });

    if (!dataPool) {
      console.error('No data pool found for agent:', agentId);
      return new ChatSDKError('not_found:agent').toResponse();
    }

    console.log('Data pool found:', dataPool.id, dataPool.name);

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Check file size (limit to 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File size too large. Maximum allowed size is 10MB.' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: 'Document title is required' },
        { status: 400 }
      );
    }

    // Validate file type - allow text files and PDFs (if PDF processing is available)
    const allowedTypes = getSupportedFileTypes();
    const fileType = file.type || 'text/plain';
    const fileName = file.name.toLowerCase();

    // Check file extension as backup
    const allowedExtensions = getSupportedFileExtensions();
    const hasAllowedExtension = allowedExtensions.some(ext => fileName.endsWith(ext));

    if (!allowedTypes.includes(fileType) && !hasAllowedExtension) {
      const supportedFormats = allowedExtensions.join(', ');
      return NextResponse.json(
        { error: `Unsupported file type. Supported formats: ${supportedFormats}` },
        { status: 400 }
      );
    }

    // Additional check for PDF files when PDF processing is not available
    if (isPdfFile(file) && !isPdfProcessingAvailable()) {
      return NextResponse.json(
        { error: 'PDF processing is not available. Please configure MISTRAL_API_KEY environment variable.' },
        { status: 400 }
      );
    }

    // Process file content based on type
    let content: string;
    let extractedImages: Array<{ base64: string; description?: string; embedding?: number[] }> | undefined;
    let embedding: number[] | undefined;

    if (isPdfFile(file)) {
      // Handle PDF files with Mistral OCR
      console.log('Processing PDF file with Mistral OCR...');
      const pdfResult = await processPdfWithMistralOCR(file);

      if (!pdfResult.success) {
        return NextResponse.json(
          { error: pdfResult.error || 'Failed to process PDF file' },
          { status: 400 }
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
          { error: 'Failed to read file content. Make sure it\'s a valid text file.' },
          { status: 400 }
        );
      }

      if (!content.trim()) {
        return NextResponse.json(
          { error: 'File content is empty' },
          { status: 400 }
        );
      }

      // Remove null bytes and other problematic characters for PostgreSQL
      content = content.replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    }

    if (!content.trim()) {
      return NextResponse.json(
        { error: 'File contains only invalid characters' },
        { status: 400 }
      );
    }

    // Generate embedding for text files (PDFs already have embeddings generated)
    if (!isPdfFile(file)) {
      try {
        embedding = await generateDocumentEmbedding(content);
        console.log('Generated embedding for text file:', embedding ? 'success' : 'failed');
      } catch (error) {
        console.error('Error generating embedding:', error);
        embedding = undefined;
      }
    }

    // Create the document
    const document = await createDataPoolDocument({
      dataPoolId: dataPool.id,
      title,
      content,
      embedding,
      metadata: {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type || 'text/plain',
        uploadedAt: new Date().toISOString(),
        ...(isPdfFile(file) && {
          processedWithOCR: true,
          ocrProvider: 'mistral',
          hasExtractedImages: extractedImages && extractedImages.length > 0,
          extractedImagesCount: extractedImages?.length || 0,
        }),
        ...(extractedImages && extractedImages.length > 0 && {
          extractedImages: extractedImages.map(img => ({
            description: img.description,
            hasEmbedding: !!img.embedding
          }))
        })
      },
    });

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
          hasEmbedding: !!embedding
        }
      })
    });

  } catch (error) {
    console.error('Error uploading document:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:agent').toResponse();
    }

    // Verify agent exists and belongs to user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // Get the data pool for this agent
    const dataPool = await getDataPoolByAgentId({ agentId });

    if (!dataPool) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // Get all documents in the data pool
    const documents = await getDataPoolDocuments({
      dataPoolId: dataPool.id
    });

    const documentsWithoutEmbeddings = documents.map(doc => ({
      id: doc.id,
      title: doc.title,
      metadata: doc.metadata,
      createdAt: doc.createdAt,
    }));

    return NextResponse.json({
      documents: documentsWithoutEmbeddings,
      dataPool: {
        id: dataPool.id,
        name: dataPool.name,
      }
    });

  } catch (error) {
    console.error('Error getting documents:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:agent').toResponse();
    }

    // Verify agent exists and belongs to user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // Get the data pool for this agent
    const dataPool = await getDataPoolByAgentId({ agentId });

    if (!dataPool) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // Delete the document (this will also delete the embeddings since they're stored in the same table)
    await deleteDataPoolDocument({
      id: documentId,
      dataPoolId: dataPool.id,
    });

    return NextResponse.json({
      success: true,
      message: 'Document deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting document:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}