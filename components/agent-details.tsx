'use client';

import { useState, useRef } from 'react';
import {
  BotIcon,
  MessageSquareIcon,
  FileTextIcon,
  UploadIcon,
  Trash2Icon,
  PlusIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/toast';
import type { Agent, WorkflowNode, WorkflowEdge } from '@/lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface AgentDetailsProps {
  agent: Agent;
  workflowNodes: WorkflowNode[];
  workflowEdges: WorkflowEdge[];
}

interface DataPoolDocument {
  id: string;
  title: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export function AgentDetails({ agent, workflowNodes, workflowEdges }: AgentDetailsProps) {
  const [documents, setDocuments] = useState<DataPoolDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

    const loadDocuments = async () => {
    if (documentsLoaded) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/agents/${agent.id}/documents`);
      if (!response.ok) {
        throw new Error('Failed to load documents');
      }
      const data = await response.json();
      setDocuments(data.documents);
      setDocumentsLoaded(true);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        type: 'error',
        description: 'Failed to load documents',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // For multiple files, we'll handle them in the upload function
      // Just clear the title field since we'll use filenames
      if (titleInputRef.current) {
        titleInputRef.current.value = '';
      }
    }
  };

  const handleUpload = async () => {
    const fileInput = fileInputRef.current;

    if (!fileInput?.files || fileInput.files.length === 0) {
      toast({
        type: 'error',
        description: 'Please select at least one file',
      });
      return;
    }

    setIsUploading(true);
    try {
      const files = Array.from(fileInput.files);
      let successCount = 0;
      let errorCount = 0;

      for (const file of files) {
        try {
          const formData = new FormData();
          formData.append('file', file);

          // Use filename as title (without extension)
          const fileName = file.name;
          const titleWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
          formData.append('title', titleWithoutExtension);

          const response = await fetch(`/api/agents/${agent.id}/documents`, {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Upload failed');
          }

          successCount++;
        } catch (error) {
          console.error(`Error uploading ${file.name}:`, error);
          errorCount++;
        }
      }

      // Refresh documents list
      await loadDocuments();

      // Reset form
      fileInput.value = '';

      // Show results
      if (errorCount === 0) {
        toast({
          type: 'success',
          description: `Successfully uploaded ${successCount} document${successCount !== 1 ? 's' : ''}`,
        });
      } else if (successCount > 0) {
        toast({
          type: 'warning',
          description: `Uploaded ${successCount} document${successCount !== 1 ? 's' : ''}, ${errorCount} failed`,
        });
      } else {
        toast({
          type: 'error',
          description: `Failed to upload ${errorCount} document${errorCount !== 1 ? 's' : ''}`,
        });
      }
    } catch (error) {
      console.error('Error in upload process:', error);
      toast({
        type: 'error',
        description: 'Upload process failed',
      });
    } finally {
      setIsUploading(false);
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
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-sm font-semibold">
                  {index + 1}
                </div>
                <div>
                  <h3 className="font-semibold text-sm">{node.name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{node.nodeType}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{node.description}</p>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Data Pool Documents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Data Pool Documents</h2>
          <Button variant="outline" onClick={loadDocuments} disabled={isLoading}>
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        {/* Upload Section */}
        <Card className="p-4 mb-4">
          <h3 className="font-semibold mb-3">Upload New Documents</h3>
          <div>
            <Label htmlFor="document-file">Select Files</Label>
            <Input
              id="document-file"
              type="file"
              ref={fileInputRef}
              accept=".txt,.md,.pdf,.doc,.docx"
              disabled={isUploading}
              onChange={handleFileChange}
              multiple
            />
            <p className="text-xs text-muted-foreground mt-1">
              You can select multiple files. Titles will be automatically generated from filenames.
            </p>
          </div>
          <Button
            onClick={handleUpload}
            className="mt-3"
            disabled={isUploading}
          >
            {isUploading ? (
              <>Uploading...</>
            ) : (
              <>
                <UploadIcon size={16} className="mr-2" />
                Upload Documents
              </>
            )}
          </Button>
        </Card>

        {/* Documents List */}
        {documentsLoaded && (
          <div className="space-y-2">
            {documents.length === 0 ? (
              <Card className="p-8 text-center">
                <FileTextIcon size={48} className="mx-auto text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No documents yet</h3>
                <p className="text-muted-foreground">
                  Upload documents to provide knowledge for your agent
                </p>
              </Card>
            ) : (
              documents.map((doc) => (
                <Card key={doc.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileTextIcon size={20} className="text-muted-foreground" />
                      <div>
                        <h4 className="font-medium">{doc.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          Uploaded {formatDistanceToNow(doc.createdAt)} ago
                          {doc.metadata?.fileName && ` • ${doc.metadata.fileName}`}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm">
                      <Trash2Icon size={16} />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}