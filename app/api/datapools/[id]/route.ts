import { auth } from '@/app/(auth)/auth';
import {
  getDataPoolById,
  deleteDataPool as deleteDataPoolFromDB,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    // Verify the data pool exists and belongs to the user
    const dataPool = await getDataPoolById({
      id,
      userId: session.user.id,
    });

    if (!dataPool) {
      return new ChatSDKError('not_found:database').toResponse();
    }

    await deleteDataPoolFromDB({
      id,
      userId: session.user.id,
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error deleting data pool:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}
