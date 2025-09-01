import { auth } from '@/app/(auth)/auth';
import {
  getDataPoolsByAgentId,
  connectAgentToDataPool,
  disconnectAgentFromDataPool,
  getAgentById
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    // Verify the agent exists and belongs to the user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
      return new ChatSDKError('not_found:database').toResponse();
    }

    const dataPools = await getDataPoolsByAgentId({
      agentId,
    });

    return NextResponse.json({
      dataPools,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error fetching connected data pools:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const { dataPoolId } = await request.json();
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    // Verify the agent exists and belongs to the user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
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

    console.error('Error connecting data pool:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params;
    const { dataPoolId } = await request.json();
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    // Verify the agent exists and belongs to the user
    const agent = await getAgentById({
      id: agentId,
      userId: session.user.id,
    });

    if (!agent) {
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

    console.error('Error disconnecting data pool:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}
