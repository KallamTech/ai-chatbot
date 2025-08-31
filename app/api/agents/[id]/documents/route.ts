import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { 
  getAgentById, 
  getDataPoolByAgentId, 
  createDataPoolDocument,
  getDataPoolDocuments 
} from '@/lib/db/queries';
import { generateDocumentEmbedding } from '@/lib/utils';
import { ChatSDKError } from '@/lib/errors';

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
      return new ChatSDKError('not_found:agent').toResponse();
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    if (!title) {
      return NextResponse.json(
        { error: 'Document title is required' },
        { status: 400 }
      );
    }

    // Read file content
    const content = await file.text();
    
    if (!content.trim()) {
      return NextResponse.json(
        { error: 'File content is empty' },
        { status: 400 }
      );
    }

    // Generate embedding for the document
    const embedding = await generateDocumentEmbedding(content);

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
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        title: document.title,
        metadata: document.metadata,
      },
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