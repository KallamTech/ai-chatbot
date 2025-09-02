import { redirect } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import { getAgentsByUserId } from '@/lib/db/queries';
import { AgentsList } from '@/components/agents-list';

export default async function AgentsPage() {
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (!session.user) {
    return null;
  }

  const agents = await getAgentsByUserId({ userId: session.user.id });

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-4">
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Your Agents</h1>
            <p className="text-muted-foreground">
              Create and manage AI agents that can help with specific tasks
            </p>
          </div>
        </div>

        <div className="border rounded-lg p-4 bg-muted/50">
          <h3 className="font-semibold mb-2">Getting Started</h3>
          <p className="text-sm text-muted-foreground mb-2">
            To create an agent, simply start a new chat and say something like:
          </p>
          <div className="bg-background border rounded-md p-3 text-sm font-mono">
            &quot;Create an agent that extracts key information from contracts
            and summarizes them&quot;
          </div>
        </div>

        <AgentsList agents={agents} />
      </div>
    </div>
  );
}
