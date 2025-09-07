'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  DatabaseIcon,
  FileTextIcon,
  UploadIcon,
  Trash2Icon,
  LinkIcon,
  UnlinkIcon,
  BotIcon,
  ArrowLeftIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { DataPool, DataPoolDocument, Agent } from '@/lib/db/schema';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';

interface DocumentMetadata {
  // File information
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  uploadedAt?: string;

  // Basic content metrics
  contentLength?: number;
  wordCount?: number;
  characterCount?: number;
  lineCount?: number;
  paragraphCount?: number;
  sentenceCount?: number;
  estimatedPages?: number;

  // Document structure
  hasHeadings?: boolean;
  headingCount?: number;
  headingLevels?: number[];
  hasLists?: boolean;
  listCount?: number;
  hasTables?: boolean;
  tableCount?: number;
  hasCodeBlocks?: boolean;
  codeBlockCount?: number;

  // Content analysis
  documentType?: string;
  language?: string;
  readabilityScore?: number;
  averageWordsPerSentence?: number;
  averageSyllablesPerWord?: number;

  // Entity extraction
  dates?: string[];
  emails?: string[];
  urls?: string[];
  phoneNumbers?: string[];
  organizations?: string[];
  people?: string[];
  locations?: string[];

  // Topics and keywords
  topics?: string[];
  keywords?: string[];
  keyPhrases?: string[];

  // File-specific metadata
  hasImages?: boolean;
  imageCount?: number;
  hasFootnotes?: boolean;
  footnoteCount?: number;

  // Processing info
  processingStatus?: string;
  requiresOCR?: boolean;
  binaryFile?: boolean;
  processedWithOCR?: boolean;
  hasExtractedImages?: boolean;
  extractedImagesCount?: number;
  ocrProvider?: string;
  ocrMetadata?: {
    model: string;
    pagesProcessed: number;
    docSizeBytes: number;
    averageDpi: number;
    pageDimensions: Array<{ width: number; height: number; dpi: number }>;
    processingTime?: number;
  };

  // Legacy fields
  sourceDocument?: string;
  sourceDocumentTitle?: string;
}

interface ExtendedDataPoolDocument extends Omit<DataPoolDocument, 'metadata'> {
  metadata?: DocumentMetadata;
}

interface DataPoolManagerProps {
  dataPool: DataPool;
  documents: ExtendedDataPoolDocument[];
  allAgents: Agent[];
}

export function DataPoolManager({
  dataPool,
  documents: initialDocuments,
  allAgents,
}: DataPoolManagerProps) {
  const [documents, setDocuments] =
    useState<ExtendedDataPoolDocument[]>(initialDocuments);
  const [connectedAgents, setConnectedAgents] = useState<Agent[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(
    null,
  );
  const [connectingAgentId, setConnectingAgentId] = useState<string | null>(
    null,
  );
  const [disconnectingAgentId, setDisconnectingAgentId] = useState<
    string | null
  >(null);
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Infinite scroll state
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [nextCursor, setNextCursor] = useState<number | undefined>(undefined);
  const [isInitialLoad, setIsInitialLoad] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const loadConnectedAgents = useCallback(async () => {
    try {
      const response = await fetch(`/api/datapools/${dataPool.id}/agents`);
      if (!response.ok) {
        throw new Error('Failed to load connected agents');
      }
      const data = await response.json();
      setConnectedAgents(data.agents);
    } catch (error) {
      console.error('Error loading connected agents:', error);
      toast({
        type: 'error',
        description: 'Failed to load connected agents',
      });
    }
  }, [dataPool.id]);

  // Load connected agents on mount
  useEffect(() => {
    loadConnectedAgents();
  }, [loadConnectedAgents]);

  // Initialize pagination state from initial documents
  useEffect(() => {
    // If we have initial documents, assume there might be more
    if (initialDocuments.length > 0) {
      setHasMore(initialDocuments.length >= 50); // If we got 50, there might be more
      setNextCursor(initialDocuments.length);
    } else {
      // If no initial documents, load the first page
      setIsInitialLoad(true);
      loadDocuments().finally(() => setIsInitialLoad(false));
    }
  }, [initialDocuments]);

  // Scroll detection for infinite loading
  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 200; // 200px threshold

      if (isNearBottom && hasMore && !isLoadingMore) {
        loadMoreDocuments();
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll);
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [hasMore, isLoadingMore, nextCursor]);

  const loadDocuments = async (cursor?: number, append = false) => {
    try {
      const url = new URL(
        `/api/datapools/${dataPool.id}/documents`,
        window.location.origin,
      );
      if (cursor !== undefined) {
        url.searchParams.set('cursor', cursor.toString());
      }
      url.searchParams.set('limit', '50'); // Load 50 documents per page

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error('Failed to load documents');
      }
      const data = await response.json();

      if (append) {
        setDocuments((prev) => [...prev, ...data.documents]);
      } else {
        setDocuments(data.documents);
      }

      setHasMore(data.pagination?.hasMore ?? false);
      setNextCursor(data.pagination?.nextCursor);
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        type: 'error',
        description: 'Failed to load documents',
      });
    }
  };

  const loadMoreDocuments = async () => {
    if (isLoadingMore || !hasMore || nextCursor === undefined) return;

    setIsLoadingMore(true);
    try {
      await loadDocuments(nextCursor, true);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    setSelectedFiles(files);
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

          const response = await fetch(
            `/api/datapools/${dataPool.id}/documents`,
            {
              method: 'POST',
              body: formData,
            },
          );

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
      setSelectedFiles(null);

      // Show results
      if (errorCount === 0) {
        toast({
          type: 'success',
          description: `Successfully uploaded ${successCount} document${successCount !== 1 ? 's' : ''}`,
        });
        // Refresh documents list to show new uploads
        await loadDocuments();
      } else if (successCount > 0) {
        toast({
          type: 'error',
          description: `Uploaded ${successCount} document${successCount !== 1 ? 's' : ''}, ${errorCount} failed`,
        });
        // Refresh documents list to show successful uploads
        await loadDocuments();
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

  const handleDeleteDocument = async (documentId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this document? This action cannot be undone and will also remove the document's embeddings.",
      )
    ) {
      return;
    }

    setDeletingDocumentId(documentId);
    try {
      const response = await fetch(
        `/api/datapools/${dataPool.id}/documents?documentId=${documentId}`,
        {
          method: 'DELETE',
        },
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Delete failed');
      }

      await loadDocuments();

      toast({
        type: 'success',
        description: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        type: 'error',
        description: 'Failed to delete document',
      });
    } finally {
      setDeletingDocumentId(null);
    }
  };

  const handleConnectAgent = async (agentId: string) => {
    setConnectingAgentId(agentId);
    try {
      const response = await fetch(`/api/datapools/${dataPool.id}/agents`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to connect agent');
      }

      // Refresh connected agents list which will also update available agents
      await loadConnectedAgents();

      toast({
        type: 'success',
        description: 'Agent connected successfully',
      });
    } catch (error) {
      console.error('Error connecting agent:', error);
      toast({
        type: 'error',
        description: 'Failed to connect agent',
      });
    } finally {
      setConnectingAgentId(null);
    }
  };

  const handleDisconnectAgent = async (agentId: string) => {
    if (
      !confirm(
        'Are you sure you want to disconnect this agent from the data pool?',
      )
    ) {
      return;
    }

    setDisconnectingAgentId(agentId);
    try {
      const response = await fetch(`/api/datapools/${dataPool.id}/agents`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentId }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect agent');
      }

      // Refresh connected agents list which will also update available agents
      await loadConnectedAgents();

      toast({
        type: 'success',
        description: 'Agent disconnected successfully',
      });
    } catch (error) {
      console.error('Error disconnecting agent:', error);
      toast({
        type: 'error',
        description: 'Failed to disconnect agent',
      });
    } finally {
      setDisconnectingAgentId(null);
    }
  };

  const connectedAgentIds = new Set(connectedAgents.map((agent) => agent.id));
  const availableAgents = allAgents.filter(
    (agent) => !connectedAgentIds.has(agent.id),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/datapools">
          <Button variant="ghost" size="sm">
            <ArrowLeftIcon size={16} className="mr-2" />
            Back to Data Pools
          </Button>
        </Link>
        <div className="flex items-center gap-4 flex-1">
          <div className="p-3 bg-blue-100 rounded-lg">
            <DatabaseIcon size={32} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">{dataPool.name}</h1>
            {dataPool.description && (
              <p className="text-muted-foreground mt-1">
                {dataPool.description}
              </p>
            )}
            <p className="text-sm text-muted-foreground mt-2">
              Created {formatDistanceToNow(dataPool.createdAt)} ago
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Connected Agents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Connected Agents</h2>
          <span className="text-sm text-muted-foreground">
            {connectedAgents.length} agent
            {connectedAgents.length !== 1 ? 's' : ''} connected
          </span>
        </div>

        {connectedAgents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            {connectedAgents.map((agent) => (
              <Card key={agent.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <BotIcon size={20} className="text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm truncate">
                        {agent.title}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {agent.description}
                      </p>
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDisconnectAgent(agent.id)}
                          disabled={disconnectingAgentId === agent.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          {disconnectingAgentId === agent.id ? (
                            <div className="size-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <UnlinkIcon size={14} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Disconnect agent</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="p-8 text-center mb-4">
            <BotIcon size={48} className="mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold mb-2">No agents connected</h3>
            <p className="text-muted-foreground">
              Connect agents to this data pool so they can access its documents
            </p>
          </Card>
        )}

        {/* Available Agents to Connect */}
        {availableAgents.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Available Agents</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {availableAgents.map((agent) => (
                <Card key={agent.id} className="p-4 border-dashed">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="p-2 bg-muted rounded-lg">
                        <BotIcon size={20} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-sm truncate">
                          {agent.title}
                        </h3>
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {agent.description}
                        </p>
                      </div>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleConnectAgent(agent.id)}
                            disabled={connectingAgentId === agent.id}
                          >
                            {connectingAgentId === agent.id ? (
                              <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <LinkIcon size={14} />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Connect agent</p>
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

      <Separator />

      {/* Documents */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Documents</h2>
          <span className="text-sm text-muted-foreground">
            {documents.length} document{documents.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Upload Section */}
        <Card className="p-6 mb-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Add Documents</h3>
            <Button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="bg-primary hover:bg-primary/90"
            >
              {isUploading ? (
                <>
                  <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Uploading...
                </>
              ) : (
                <>
                  <UploadIcon size={16} className="mr-2" />
                  Add Documents
                </>
              )}
            </Button>
          </div>

          <Input
            id="document-file"
            type="file"
            ref={fileInputRef}
            accept=".txt,.md,.csv,.json,.html,.css,.js,.xml,.log,.pdf"
            disabled={isUploading}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            {selectedFiles && selectedFiles.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <FileTextIcon size={16} />
                  <span>
                    {selectedFiles.length} file
                    {selectedFiles.length !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {Array.from(selectedFiles).map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 text-sm bg-background p-2 rounded border"
                    >
                      <FileTextIcon size={14} />
                      <span className="truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={handleUpload}
                    disabled={isUploading}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isUploading ? (
                      <>
                        <div className="size-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <UploadIcon size={16} className="mr-2" />
                        Upload Files
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedFiles(null);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    disabled={isUploading}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileTextIcon size={16} />
                  <span>
                    Click &quot;Add Documents&quot; to select files from your
                    computer
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="font-medium text-foreground mb-1">
                      Supported Formats:
                    </p>
                    <p className="text-muted-foreground">
                      .txt, .md, .csv, .json, .html, .css, .js, .xml, .log, .pdf
                    </p>
                  </div>
                  <div>
                    <p className="font-medium text-foreground mb-1">
                      Processing:
                    </p>
                    <p className="text-muted-foreground">
                      Multiple files supported • Auto-generated titles
                    </p>
                  </div>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2 text-green-600">
                    <span>✅</span>
                    <span>Text files are processed immediately</span>
                  </div>
                  <div className="flex items-center gap-2 text-orange-600">
                    <span>📄</span>
                    <span>PDFs use OCR and multimodal embeddings</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-600">
                    <span>⚠️</span>
                    <span>Binary files stored as metadata only</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Documents List */}
        <div
          ref={scrollContainerRef}
          className="space-y-2 max-h-[600px] overflow-y-auto"
        >
          {isInitialLoad ? (
            <Card className="p-8 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="size-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-muted-foreground">
                  Loading documents...
                </span>
              </div>
            </Card>
          ) : documents.length === 0 ? (
            <Card className="p-8 text-center">
              <FileTextIcon
                size={48}
                className="mx-auto text-muted-foreground mb-4"
              />
              <h3 className="font-semibold mb-2">No documents yet</h3>
              <p className="text-muted-foreground">
                Upload documents to this data pool
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>
                          Uploaded {formatDistanceToNow(doc.createdAt)} ago
                          {doc.metadata?.fileName &&
                            ` • ${doc.metadata.fileName}`}
                        </span>
                        {doc.metadata?.wordCount && (
                          <span className="text-xs text-muted-foreground">
                            • {doc.metadata.wordCount} words
                          </span>
                        )}
                        {doc.metadata?.estimatedPages && (
                          <span className="text-xs text-muted-foreground">
                            • ~{doc.metadata.estimatedPages} pages
                          </span>
                        )}
                        {doc.metadata?.documentType && (
                          <span className="text-xs text-muted-foreground">
                            • {doc.metadata.documentType.replace(/_/g, ' ')}
                          </span>
                        )}
                        {doc.metadata?.language &&
                          doc.metadata.language !== 'en' && (
                            <span className="text-xs text-muted-foreground">
                              • {doc.metadata.language.toUpperCase()}
                            </span>
                          )}
                      </div>

                      {/* Document type and processing badges */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {/* Document type badges */}
                        {doc.metadata?.documentType && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                            📄 {doc.metadata.documentType.replace(/_/g, ' ')}
                          </span>
                        )}

                        {/* Structure badges */}
                        {doc.metadata?.hasHeadings && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                            📋 {doc.metadata.headingCount} Headings
                          </span>
                        )}
                        {doc.metadata?.hasTables && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
                            📊 {doc.metadata.tableCount} Tables
                          </span>
                        )}
                        {doc.metadata?.hasLists && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-700">
                            📝 {doc.metadata.listCount} Lists
                          </span>
                        )}
                        {doc.metadata?.hasCodeBlocks && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
                            💻 {doc.metadata.codeBlockCount} Code Blocks
                          </span>
                        )}

                        {/* Content badges */}
                        {doc.metadata?.topics &&
                          doc.metadata.topics.length > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-indigo-100 text-indigo-700">
                              🏷️ {doc.metadata.topics.slice(0, 2).join(', ')}
                              {doc.metadata.topics.length > 2 &&
                                ` +${doc.metadata.topics.length - 2}`}
                            </span>
                          )}

                        {/* Entity badges */}
                        {doc.metadata?.organizations &&
                          doc.metadata.organizations.length > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">
                              🏢 {doc.metadata.organizations.length}{' '}
                              Organizations
                            </span>
                          )}
                        {doc.metadata?.people &&
                          doc.metadata.people.length > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-pink-100 text-pink-700">
                              👥 {doc.metadata.people.length} People
                            </span>
                          )}
                        {doc.metadata?.dates &&
                          doc.metadata.dates.length > 0 && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-teal-100 text-teal-700">
                              📅 {doc.metadata.dates.length} Dates
                            </span>
                          )}

                        {/* Processing badges */}
                        {doc.metadata?.processedWithOCR && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                            🔍 OCR Processed
                          </span>
                        )}
                        {doc.metadata?.hasExtractedImages && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
                            🖼️ {doc.metadata.extractedImagesCount} Images
                          </span>
                        )}
                        {doc.metadata?.readabilityScore && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700">
                            📖 Readability:{' '}
                            {Math.round(doc.metadata.readabilityScore)}
                          </span>
                        )}

                        {/* Legacy badges */}
                        {doc.metadata?.sourceDocument && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700">
                            📎 From: {doc.metadata.sourceDocumentTitle}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteDocument(doc.id)}
                          disabled={deletingDocumentId === doc.id}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          {deletingDocumentId === doc.id ? (
                            <div className="size-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Trash2Icon size={16} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Delete document and remove embeddings</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </Card>
            ))
          )}

          {/* Loading indicator for infinite scroll */}
          {isLoadingMore && (
            <Card className="p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <div className="size-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">
                  Loading more documents...
                </span>
              </div>
            </Card>
          )}

          {/* End of list indicator */}
          {!hasMore && documents.length > 0 && (
            <Card className="p-4 text-center">
              <div className="text-sm text-muted-foreground">
                📄 All documents loaded ({documents.length} total)
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
