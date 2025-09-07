import { auth } from '@/app/(auth)/auth';
import {
  getDataPoolsByUserId,
  createDataPool as createDataPoolInDB,
} from '@/lib/db/queries';
import { upstashVectorService } from '@/lib/vector/upstash';
import { ChatSDKError } from '@/lib/errors';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    const dataPools = await getDataPoolsByUserId({
      userId: session.user.id,
    });

    return NextResponse.json({
      dataPools,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error fetching data pools:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return new ChatSDKError('unauthorized:auth').toResponse();
    }

    const { name, description } = await request.json();

    if (!name?.trim()) {
      return new ChatSDKError(
        'bad_request:database',
        'Name is required',
      ).toResponse();
    }

    const dataPool = await createDataPoolInDB({
      userId: session.user.id,
      name: name.trim(),
      description: description?.trim() || undefined,
    });

    // Create the corresponding Upstash vector index
    try {
      await upstashVectorService.createIndex(dataPool.id);
      console.log(`Created Upstash index for datapool ${dataPool.id}`);
    } catch (error) {
      console.error(
        `Failed to create Upstash index for datapool ${dataPool.id}:`,
        error,
      );
      // Don't fail the request if index creation fails
    }

    return NextResponse.json({
      dataPool,
    });
  } catch (error) {
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    console.error('Error creating data pool:', error);
    return new ChatSDKError('bad_request:database').toResponse();
  }
}
