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
      console.error('No data pool found for agent:', agentId);
      return new ChatSDKError('not_found:datapool').toResponse();
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

            // Validate file type - allow text files and PDFs
    const allowedTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
      'text/html',
      'text/css',
      'text/javascript',
      'application/javascript',
      'text/xml',
      'application/xml',
      'application/pdf'
    ];

    const fileType = file.type || 'text/plain';
    const fileName = file.name.toLowerCase();

    // Check file extension as backup
    const textExtensions = ['.txt', '.md', '.csv', '.json', '.html', '.css', '.js', '.xml', '.log', '.pdf'];
    const hasTextExtension = textExtensions.some(ext => fileName.endsWith(ext));

    if (!allowedTypes.includes(fileType) && !hasTextExtension) {
      return NextResponse.json(
        { error: 'Only text files and PDFs are supported (txt, md, csv, json, html, css, js, xml, log, pdf)' },
        { status: 400 }
      );
    }

    // Read file content
    let content: string;
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

    if (!content.trim()) {
      return NextResponse.json(
        { error: 'File contains only invalid characters' },
        { status: 400 }
      );
    }

    // Generate embedding for the document
    let embedding: number[] | undefined;
    try {
      embedding = await generateDocumentEmbedding(content);
      console.log('Generated embedding:', embedding ? 'success' : 'failed');
    } catch (error) {
      console.error('Error generating embedding:', error);
      embedding = undefined;
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