import { redirect, notFound } from 'next/navigation';
import { auth } from '@/app/(auth)/auth';
import {
  getAgentById,
  getWorkflowNodesByAgentId,
  getWorkflowEdgesByAgentId,
} from '@/lib/db/queries';
import { AgentDetails } from '@/components/agent-details';

interface AgentPageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentPage({ params }: AgentPageProps) {
  const { id } = await params;
  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (!session.user) {
    return null;
  }

  const agent = await getAgentById({
    id,
    userId: session.user.id,
  });

  if (!agent) {
    notFound();
  }

  const [workflowNodes, workflowEdges] = await Promise.all([
    getWorkflowNodesByAgentId({ agentId: id }),
    getWorkflowEdgesByAgentId({ agentId: id }),
  ]);

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-4">
      <AgentDetails
        agent={agent}
        workflowNodes={workflowNodes}
        workflowEdges={workflowEdges}
      />
    </div>
  );
}
