'use client';

import { useState, useRef } from 'react';
import {
  DatabaseIcon,
  FileTextIcon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
  LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { DataPool } from '@/lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface DataPoolsListProps {
  dataPools: DataPool[];
}

interface CreateDataPoolDialogProps {
  onCreated: () => void;
}

function CreateDataPoolDialog({ onCreated }: CreateDataPoolDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const handleCreate = async () => {
    const name = nameRef.current?.value?.trim();
    const description = descriptionRef.current?.value?.trim();

    if (!name) {
      toast({
        type: 'error',
        description: 'Data pool name is required',
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/datapools', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          description: description || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create data pool');
      }

      toast({
        type: 'success',
        description: 'Data pool created successfully',
      });

      setIsOpen(false);
      onCreated();

      // Reset form
      if (nameRef.current) nameRef.current.value = '';
      if (descriptionRef.current) descriptionRef.current.value = '';
    } catch (error) {
      console.error('Error creating data pool:', error);
      toast({
        type: 'error',
        description: error instanceof Error ? error.message : 'Failed to create data pool',
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <Button>
          <PlusIcon size={16} className="mr-2" />
          Create Data Pool
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Create New Data Pool</SheetTitle>
          <SheetDescription>
            Create a new data pool to organize and share documents across multiple agents.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="pool-name">Name</Label>
            <Input
              id="pool-name"
              ref={nameRef}
              placeholder="e.g., Legal Documents, Research Papers, etc."
              disabled={isCreating}
            />
          </div>
          <div>
            <Label htmlFor="pool-description">Description (optional)</Label>
            <Textarea
              id="pool-description"
              ref={descriptionRef}
              placeholder="Describe what kind of documents this pool will contain..."
              disabled={isCreating}
              rows={3}
            />
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => setIsOpen(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creating...' : 'Create Data Pool'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function DataPoolsList({ dataPools: initialDataPools }: DataPoolsListProps) {
  const [dataPools, setDataPools] = useState(initialDataPools);
  const [deletingPoolId, setDeletingPoolId] = useState<string | null>(null);

  const refreshDataPools = async () => {
    try {
      const response = await fetch('/api/datapools');
      if (!response.ok) {
        throw new Error('Failed to fetch data pools');
      }
      const data = await response.json();
      setDataPools(data.dataPools);
    } catch (error) {
      console.error('Error refreshing data pools:', error);
      toast({
        type: 'error',
        description: 'Failed to refresh data pools',
      });
    }
  };

  const handleDelete = async (poolId: string) => {
    if (!confirm('Are you sure you want to delete this data pool? This will also delete all documents in the pool and disconnect it from all agents. This action cannot be undone.')) {
      return;
    }

    setDeletingPoolId(poolId);
    try {
      const response = await fetch(`/api/datapools/${poolId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete data pool');
      }

      toast({
        type: 'success',
        description: 'Data pool deleted successfully',
      });

      await refreshDataPools();
    } catch (error) {
      console.error('Error deleting data pool:', error);
      toast({
        type: 'error',
        description: error instanceof Error ? error.message : 'Failed to delete data pool',
      });
    } finally {
      setDeletingPoolId(null);
    }
  };

  if (dataPools.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <DatabaseIcon size={48} className="text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No data pools yet</h3>
        <p className="text-muted-foreground mb-4 max-w-md">
          Create your first data pool to organize documents that can be shared across multiple agents.
        </p>
        <CreateDataPoolDialog onCreated={refreshDataPools} />
      </div>
    );
  }

  return (
    <>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-foreground">
          {dataPools.length} data pool{dataPools.length !== 1 ? 's' : ''}
        </p>
        <CreateDataPoolDialog onCreated={refreshDataPools} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dataPools.map((pool) => (
          <Card key={pool.id} className="p-4 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <DatabaseIcon size={20} className="text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm truncate">{pool.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDistanceToNow(pool.createdAt)} ago
                  </p>
                </div>
              </div>
              <div className="flex gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Link href={`/datapools/${pool.id}`}>
                        <Button variant="ghost" size="sm">
                          <SettingsIcon size={14} />
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
                        onClick={() => handleDelete(pool.id)}
                        disabled={deletingPoolId === pool.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {deletingPoolId === pool.id ? (
                          <div className="size-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2Icon size={14} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Delete data pool</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>

            {pool.description && (
              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                {pool.description}
              </p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <FileTextIcon size={12} />
                <span>Documents</span>
              </div>
              <Link href={`/datapools/${pool.id}`}>
                <Button variant="outline" size="sm">
                  <LinkIcon size={14} className="mr-1" />
                  Manage
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
