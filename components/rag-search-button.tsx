'use client';

import { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { PlusIcon } from './icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from './ui/dropdown-menu';
import { toast } from 'sonner';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';

interface DataPool {
  id: string;
  name: string;
  description?: string;
}

interface RagSearchButtonProps {
  status: UseChatHelpers<ChatMessage>['status'];
  onConnectDataPool: (dataPoolId: string) => void;
  onDisconnectDataPool: (dataPoolId: string) => void;
  connectedDataPools: string[];
}

export function RagSearchButton({ status, onConnectDataPool, onDisconnectDataPool, connectedDataPools }: RagSearchButtonProps) {
  const [dataPools, setDataPools] = useState<DataPool[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);


  const loadDataPools = useCallback(async () => {
    if (dataPools.length > 0) return; // Already loaded

    setIsLoading(true);
    try {
      const response = await fetch('/api/datapools');
      if (response.ok) {
        const data = await response.json();
        setDataPools(data.dataPools || []);
      } else {
        toast.error('Failed to load data pools');
      }
    } catch (error) {
      console.error('Error loading data pools:', error);
      toast.error('Failed to load data pools');
    } finally {
      setIsLoading(false);
    }
  }, [dataPools.length]);


  const handleDataPoolSelect = (dataPoolId: string) => {
    const dataPool = dataPools.find(dp => dp.id === dataPoolId);
    if (!dataPool) return;

    const isConnected = connectedDataPools.includes(dataPoolId);

    if (isConnected) {
      // Disconnect the datapool
      onDisconnectDataPool(dataPoolId);
      toast.success(`Disconnected "${dataPool.name}" from this chat.`);
    } else {
      // Connect the datapool to the chat session
      onConnectDataPool(dataPoolId);
      toast.success(`Connected "${dataPool.name}" to this chat. You can now ask questions about your documents!`);
    }

    // Keep dropdown open for a moment to see the change, then close it
    setTimeout(() => {
      setIsOpen(false);
    }, 1000);
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      loadDataPools();
    }
  };

  // Always show the button, but handle empty datapools in the dropdown

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          data-testid="rag-search-button"
          className={`rounded-md rounded-bl-lg p-[7px] h-fit dark:border-zinc-700 hover:dark:bg-zinc-900 hover:bg-zinc-200 border ${
            connectedDataPools.length > 0
              ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
              : 'border-gray-300 dark:border-gray-600'
          }`}
          disabled={status !== 'ready'}
          variant="ghost"
          title={connectedDataPools.length > 0 ? `Connected to ${connectedDataPools.length} datapool(s)` : "Search Data Pools"}
        >
          <PlusIcon size={14} />
          {connectedDataPools.length > 0 && (
            <span className="ml-1 text-xs text-green-600 font-bold">
              {connectedDataPools.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Search Data Pools</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isLoading ? (
          <DropdownMenuItem disabled>
            Loading data pools...
          </DropdownMenuItem>
        ) : dataPools.length === 0 ? (
          <>
            <DropdownMenuItem disabled>
              No data pools available
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                window.open('/datapools', '_blank');
                setIsOpen(false);
              }}
              className="text-blue-600 dark:text-blue-400"
            >
              Create a data pool →
            </DropdownMenuItem>
          </>
        ) : (
          dataPools.map((dataPool) => {
            const isConnected = connectedDataPools.includes(dataPool.id);
            return (
              <DropdownMenuItem
                key={dataPool.id}
                onClick={() => handleDataPoolSelect(dataPool.id)}
                className="flex flex-col items-start cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <div className="font-medium flex items-center gap-2">
                  {dataPool.name}
                  {isConnected && <span className="text-xs text-green-600">✓ Connected</span>}
                </div>
                {dataPool.description && (
                  <div className="text-xs text-muted-foreground">
                    {dataPool.description}
                  </div>
                )}
                {isConnected && (
                  <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    Click to disconnect
                  </div>
                )}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
