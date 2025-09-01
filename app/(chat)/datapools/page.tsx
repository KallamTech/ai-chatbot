import { redirect } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import { getDataPoolsByUserId } from '@/lib/db/queries';
import { DataPoolsList } from '@/components/datapools-list';

export default async function DataPoolsPage() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (!session.user) {
    return null;
  }

  const dataPools = await getDataPoolsByUserId({ userId: session.user.id });

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Data Pools</h1>
            <p className="text-muted-foreground">
              Create and manage data pools that can be shared across multiple
              agents
            </p>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-muted/50">
          <h3 className="font-semibold mb-2">About Data Pools</h3>
          <p className="text-sm text-muted-foreground mb-2">
            Data pools are collections of documents that can be connected to
            multiple agents. This allows you to:
          </p>
          <ul className="text-sm text-muted-foreground list-disc ml-6 space-y-1">
            <li>Share knowledge across multiple agents</li>
            <li>Manage documents centrally</li>
            <li>Connect the same data to different specialized agents</li>
            <li>Reduce duplication of uploaded documents</li>
          </ul>
        </div>

        <DataPoolsList dataPools={dataPools} />
      </div>
    </div>
  );
}
