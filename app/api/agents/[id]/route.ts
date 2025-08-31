import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { deleteAgent, getAgentById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    // Verify agent exists and belongs to user
    const agent = await getAgentById({
      id,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    // Delete agent (cascading delete will handle data pools, documents, workflow nodes, and edges)
    await deleteAgent({
      id,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting agent:', error);
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
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const agent = await getAgentById({
      id,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:agent').toResponse();
    }

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('Error getting agent:', error);
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}