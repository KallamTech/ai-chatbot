import { auth } from '@/app/(auth)/auth';
import {
  getDataPoolsByAgentId,
  connectAgentToDataPool,
  disconnectAgentFromDataPool,
  getDataPoolById,
  getAgentsByDataPoolId
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
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

    // Get agents connected to this data pool
    const agents = await getAgentsByDataPoolId({
      dataPoolId,
    });

    return NextResponse.json({
      agents,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error fetching connected agents:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dataPoolId } = await params;
    const { agentId } = await request.json();
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

    await connectAgentToDataPool({
      agentId,
      dataPoolId,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error connecting agent:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: dataPoolId } = await params;
    const { agentId } = await request.json();
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

    await disconnectAgentFromDataPool({
      agentId,
      dataPoolId,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error disconnecting agent:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}
