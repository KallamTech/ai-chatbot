'use client';

import { useState } from 'react';
import { BotIcon, Trash2Icon, MoreVerticalIcon, FileTextIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/components/toast';
import type { Agent } from '@/lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface AgentsListProps {
  agents: Agent[];
}

export function AgentsList({ agents: initialAgents }: AgentsListProps) {
  const [agents, setAgents] = useState(initialAgents);
  const [deleteAgent, setDeleteAgent] = useState<Agent | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAgent = async (agent: Agent) => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/agents/${agent.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete agent');
      }

      setAgents(agents.filter(a => a.id !== agent.id));
      setDeleteAgent(null);

      toast({
        type: 'success',
        description: `Agent "${agent.title}" has been deleted`,
      });
    } catch (error) {
      console.error('Error deleting agent:', error);
      toast({
        type: 'error',
        description: 'Failed to delete agent. Please try again.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BotIcon size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No agents yet</h3>
        <p className="text-muted-foreground mb-4 max-w-md">
          Create your first agent by starting a chat and describing what you want it to do.
        </p>
        <Link href="/">
          <Button>Start New Chat</Button>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <Card key={agent.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3 gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                  <BotIcon size={20} className="text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold break-words leading-tight">{agent.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(agent.createdAt)} ago
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="shrink-0">
                    <MoreVerticalIcon size={16} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link href={`/agents/${agent.id}`}>
                      <FileTextIcon size={16} className="mr-2" />
                      View Details
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setDeleteAgent(agent)}
                    className="text-red-600"
                  >
                    <Trash2Icon size={16} className="mr-2" />
                    Delete Agent
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="text-sm text-muted-foreground mb-4 overflow-hidden" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }} title={agent.description}>
              {agent.description}
            </p>

            <div className="flex justify-between items-center">
              <Link href={`/agents/${agent.id}/chat`}>
                <Button size="sm">Chat with Agent</Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteAgent} onOpenChange={() => setDeleteAgent(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteAgent?.title}&quot;? This action cannot be undone.
              All associated documents and workflow data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAgent && handleDeleteAgent(deleteAgent)}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? 'Deleting...' : 'Delete Agent'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}