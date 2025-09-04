import { redirect } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import { getAgentsByUserId } from '@/lib/db/queries';
import { AgentsList } from '@/components/agents-list';
import { PageHeader } from '@/components/page-header';

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
      <PageHeader />
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
          <p className="text-sm text-muted-foreground mb-3">
            To create an agent, simply start a new chat and say something like:
          </p>
          <div className="grid gap-3">
            <div className="bg-background border rounded-md p-3 text-sm font-mono">
              &quot;Create an agent that searches through my uploaded documents
              and answers questions about their content&quot;
            </div>
            <div className="bg-background border rounded-md p-3 text-sm font-mono">
              &quot;Build a research agent that performs deep academic research
              and creates comprehensive reports&quot;
            </div>
            <div className="bg-background border rounded-md p-3 text-sm font-mono">
              &quot;Create a data analysis agent that writes Python code to
              process data and generate visualizations&quot;
            </div>
            <div className="bg-background border rounded-md p-3 text-sm font-mono">
              &quot;Build a content creator that generates images and creates
              documents for presentations&quot;
            </div>
            <div className="bg-background border rounded-md p-3 text-sm font-mono">
              &quot;Create a news monitoring agent that tracks current events
              and provides daily briefings&quot;
            </div>
            <div className="bg-background border rounded-md p-3 text-sm font-mono">
              &quot;Build a document assistant that searches images and visual
              content in my uploaded files&quot;
            </div>
          </div>
        </div>

        <AgentsList agents={agents} />
      </div>
    </div>
  );
}
