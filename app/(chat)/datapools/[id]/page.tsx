import { redirect, notFound } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import {
  getDataPoolById,
  getDataPoolDocuments,
  getAgentsByUserId,
} from '@/lib/db/queries';
import { DataPoolManager } from '@/components/datapool-manager';

export default async function DataPoolPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = await props.params;
  const { id } = params;

  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (!session.user) {
    return null;
  }

  // Get the data pool
  const dataPool = await getDataPoolById({
    id,
    userId: session.user.id,
  });

  if (!dataPool) {
    notFound();
  }

  // Get documents in this data pool
  const documents = await getDataPoolDocuments({
    dataPoolId: dataPool.id,
  });

  // Get all user's agents for connection management
  const allAgents = await getAgentsByUserId({
    userId: session.user.id,
  });

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-4">
      <DataPoolManager
        dataPool={dataPool}
        documents={documents}
        allAgents={allAgents}
      />
    </div>
  );
}
