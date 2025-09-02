'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  BotIcon,
  MessageSquareIcon,
  DatabaseIcon,
  LinkIcon,
  UnlinkIcon,
  PlusIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type {
  Agent,
  WorkflowNode,
  WorkflowEdge,
  DataPool,
} from '@/lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface AgentDetailsProps {
  agent: Agent;
  workflowNodes: WorkflowNode[];
  workflowEdges: WorkflowEdge[];
}

export function AgentDetails({
  agent,
  workflowNodes,
  workflowEdges,
}: AgentDetailsProps) {
  const [connectedDataPools, setConnectedDataPools] = useState<DataPool[]>([]);
  const [availableDataPools, setAvailableDataPools] = useState<DataPool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingPoolId, setConnectingPoolId] = useState<string | null>(null);
  const [disconnectingPoolId, setDisconnectingPoolId] = useState<string | null>(
    null,
  );

  const loadDataPools = useCallback(async () => {
    setIsLoading(true);
    try {
      // Load connected data pools
      const connectedResponse = await fetch(
        `/api/agents/${agent.id}/datapools`,
      );
      let connectedData = { dataPools: [] };
      if (connectedResponse.ok) {
        connectedData = await connectedResponse.json();
        setConnectedDataPools(connectedData.dataPools);
      }

      // Load all available data pools
      const allResponse = await fetch('/api/datapools');
      if (allResponse.ok) {
        const allData = await allResponse.json();
        const connectedIds = new Set(
          connectedData?.dataPools?.map((dp: DataPool) => dp.id) || [],
        );
        const available = allData.dataPools.filter(
          (dp: DataPool) => !connectedIds.has(dp.id),
        );
        setAvailableDataPools(available);
      }
    } catch (error) {
      console.error('Error loading data pools:', error);
      toast({
        type: 'error',
        description: 'Failed to load data pools',
      });
    } finally {
      setIsLoading(false);
    }
  }, [agent.id]);

  useEffect(() => {
    loadDataPools();
  }, [loadDataPools]);

  const handleConnectDataPool = async (dataPoolId: string) => {
    setConnectingPoolId(dataPoolId);
    try {
      const response = await fetch(`/api/agents/${agent.id}/datapools`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataPoolId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect data pool');
      }

      toast({
        type: 'success',
        description: 'Data pool connected successfully',
      });

      await loadDataPools();
    } catch (error) {
      console.error('Error connecting data pool:', error);
      toast({
        type: 'error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to connect data pool',
      });
    } finally {
      setConnectingPoolId(null);
    }
  };

  const handleDisconnectDataPool = async (dataPoolId: string) => {
    if (
      !confirm(
        'Are you sure you want to disconnect this data pool from the agent?',
      )
    ) {
      return;
    }

    setDisconnectingPoolId(dataPoolId);
    try {
      const response = await fetch(`/api/agents/${agent.id}/datapools`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ dataPoolId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect data pool');
      }

      toast({
        type: 'success',
        description: 'Data pool disconnected successfully',
      });

      await loadDataPools();
    } catch (error) {
      console.error('Error disconnecting data pool:', error);
      toast({
        type: 'error',
        description:
          error instanceof Error
            ? error.message
            : 'Failed to disconnect data pool',
      });
    } finally {
      setDisconnectingPoolId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Agent Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <BotIcon size={32} className="text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{agent.title}</h1>
            <p className="text-muted-foreground mt-1">{agent.description}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Created {formatDistanceToNow(agent.createdAt)} ago
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/agents/${agent.id}/chat`}>
            <Button>
              <MessageSquareIcon size={16} className="mr-2" />
              Chat with Agent
            </Button>
          </Link>
        </div>
      </div>

      <Separator />

      {/* Workflow Overview */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Workflow</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {workflowNodes.map((node, index) => (
            <Card key={node.id} className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className="size-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{node.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">
                    {node.nodeType}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                {node.description}
              </p>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Connected Data Pools */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Connected Data Pools</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {connectedDataPools.length} pool
              {connectedDataPools.length !== 1 ? 's' : ''} connected
            </span>
            <Link href="/datapools">
              <Button variant="outline" size="sm">
                <PlusIcon size={14} className="mr-1" />
                Manage Data Pools
              </Button>
            </Link>
          </div>
        </div>

        {connectedDataPools.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {connectedDataPools.map((dataPool) => (
              <Card key={dataPool.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <DatabaseIcon size={20} className="text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">
                        {dataPool.name}
                      </h3>
                      {dataPool.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {dataPool.description}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Created {formatDistanceToNow(dataPool.createdAt)} ago
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Link href={`/datapools/${dataPool.id}`}>
                            <Button variant="ghost" size="sm">
                              <DatabaseIcon size={14} />
                            </Button>
                          </Link>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Manage data pool</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              handleDisconnectDataPool(dataPool.id)
                            }
                            disabled={disconnectingPoolId === dataPool.id}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            {disconnectingPoolId === dataPool.id ? (
                              <div className="size-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <UnlinkIcon size={14} />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Disconnect data pool</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center mb-6">
            <DatabaseIcon
              size={48}
              className="mx-auto text-muted-foreground mb-4"
            />
            <h3 className="font-semibold mb-2">No data pools connected</h3>
            <p className="text-muted-foreground mb-4">
              Connect data pools to provide knowledge for your agent
            </p>
            <Link href="/datapools">
              <Button>
                <PlusIcon size={16} className="mr-2" />
                Create or Connect Data Pool
              </Button>
            </Link>
          </Card>
        )}

        {/* Available Data Pools to Connect */}
        {availableDataPools.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Available Data Pools</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableDataPools.map((dataPool) => (
                <Card key={dataPool.id} className="p-4 border-dashed">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="p-2 bg-muted rounded-lg">
                        <DatabaseIcon
                          size={20}
                          className="text-muted-foreground"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate">
                          {dataPool.name}
                        </h3>
                        {dataPool.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {dataPool.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Created {formatDistanceToNow(dataPool.createdAt)} ago
                        </p>
                      </div>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConnectDataPool(dataPool.id)}
                            disabled={connectingPoolId === dataPool.id}
                          >
                            {connectingPoolId === dataPool.id ? (
                              <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <LinkIcon size={14} />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Connect data pool</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
