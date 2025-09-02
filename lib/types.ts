import { z } from 'zod';
import type { getWeather } from './ai/tools/get-weather';
import type { createDocument } from './ai/tools/create-document';
import type { updateDocument } from './ai/tools/update-document';
import type { requestSuggestions } from './ai/tools/request-suggestions';
import type { createAgent } from './ai/tools/create-agent';
import type { webSearch, newsSearch } from './ai/tools/websearch';
import type { pythonRuntime } from './ai/tools/python-runtime';
import type { InferUITool, UIMessage } from 'ai';

import type { ArtifactKind } from '@/components/artifact';
import type { Suggestion } from './db/schema';

export type DataPart = { type: 'append-message'; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type createAgentTool = InferUITool<ReturnType<typeof createAgent>>;
type webSearchTool = InferUITool<ReturnType<typeof webSearch>>;
type newsSearchTool = InferUITool<ReturnType<typeof newsSearch>>;
type pythonRuntimeTool = InferUITool<ReturnType<typeof pythonRuntime>>;

// Agent-specific tools (dynamically created)
type searchDocumentsTool = {
  type: 'tool-searchDocuments';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    query: string;
    limit?: number;
    searchImages?: boolean;
  };
  output: {
    results?: Array<{
      title: string;
      content: string;
      similarity: number;
      metadata?: {
        fileName?: string;
        documentType?: string;
      };
    }>;
    error?: string;
  };
};

type findDocumentByTitleTool = {
  type: 'tool-findDocumentByTitle';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    title: string;
    exactMatch?: boolean;
  };
  output: {
    found: boolean;
    count?: number;
    documents?: Array<{
      id: string;
      title: string;
      metadata?: {
        fileName?: string;
      };
    }>;
    message?: string;
    suggestions?: string[];
    error?: string;
  };
};

type getDocumentMetadataTool = {
  type: 'tool-getDocumentMetadata';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    documentId: string;
  };
  output: {
    found: boolean;
    document?: {
      id: string;
      title: string;
      metadata?: any;
      createdAt: string;
    };
    message?: string;
    error?: string;
  };
};

type searchSpecificDocumentTool = {
  type: 'tool-searchSpecificDocument';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    documentId: string;
    query: string;
  };
  output: {
    found: boolean;
    document?: {
      id: string;
      title: string;
      metadata?: any;
    };
    searchResults?: {
      results?: Array<{
        content: string;
        similarity: number;
      }>;
    };
    message?: string;
    error?: string;
  };
};

type searchImagesTool = {
  type: 'tool-searchImages';
  toolCallId: string;
  state: 'input-available' | 'output-available';
  input: {
    query: string;
    limit?: number;
    threshold?: number;
  };
  output: {
    results?: Array<{
      title: string;
      content: string;
      similarity: number;
      metadata?: {
        fileName?: string;
        documentType?: string;
      };
    }>;
    recommendedThreshold?: string;
    error?: string;
  };
};

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  createAgent: createAgentTool;
  webSearch: webSearchTool;
  newsSearch: newsSearchTool;
  pythonRuntime: pythonRuntimeTool;
  // Agent-specific tools
  searchDocuments: searchDocumentsTool;
  findDocumentByTitle: findDocumentByTitleTool;
  getDocumentMetadata: getDocumentMetadataTool;
  searchSpecificDocument: searchSpecificDocumentTool;
  searchImages: searchImagesTool;
};

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  codeExecution: {
    status: 'starting' | 'loading_packages' | 'completed' | 'error';
    description?: string;
    message?: string;
    output?: string;
    result?: string | null;
    error?: string;
  };
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}
