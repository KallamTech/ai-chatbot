'use client';
import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
import type { Vote } from '@/lib/db/schema';
import { DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { Response } from './elements/response';
import { MessageContent } from './elements/message';
import {
  Tool,
  ToolHeader,
  ToolContent,
  ToolInput,
  ToolOutput,
} from './elements/tool';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { PythonRuntimeDisplay } from './python-runtime-display';
import { usePythonRuntime } from '@/hooks/use-python-runtime';
import { AgentPythonExecutor } from './agent-python-executor';

// Type narrowing is handled by TypeScript's control flow analysis
// The AI SDK provides proper discriminated unions for tool calls

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  useDataStream();
  const { executions } = usePythonRuntime();

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="px-4 mx-auto w-full max-w-3xl group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="flex justify-center items-center rounded-full ring-1 size-8 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div
            className={cn('flex flex-col gap-4 w-full', {
              'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            })}
          >
            {attachmentsFromMessage.length > 0 && (
              <div
                data-testid={`message-attachments`}
                className="flex flex-row gap-2 justify-end"
              >
                {attachmentsFromMessage.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={{
                      name: attachment.filename ?? 'file',
                      contentType: attachment.mediaType,
                      url: attachment.url,
                    }}
                  />
                ))}
              </div>
            )}

            {/* Python Runtime Executions */}
            {message.role === 'assistant' && executions.length > 0 && (
              <div className="space-y-2">
                {executions.map((execution) => (
                  <PythonRuntimeDisplay
                    key={execution.id}
                    executionData={execution}
                  />
                ))}
              </div>
            )}

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (type === 'reasoning' && part.text?.trim().length > 0) {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.text}
                  />
                );
              }

              if (type === 'text') {
                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 rounded-full opacity-0 h-fit text-muted-foreground group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <MessageContent
                        data-testid="message-content"
                        className={cn('justify-start items-start text-left', {
                          'bg-primary text-primary-foreground':
                            message.role === 'user',
                          'bg-transparent': message.role === 'assistant',
                        })}
                      >
                        <Response>{sanitizeText(part.text)}</Response>
                      </MessageContent>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      <div className="size-8" />

                      <MessageEditor
                        key={message.id}
                        message={message}
                        setMode={setMode}
                        setMessages={setMessages}
                        regenerate={regenerate}
                      />
                    </div>
                  );
                }
              }

              if (type === 'tool-getWeather') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-getWeather" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            <Weather weatherAtLocation={(part as any).output} />
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-createDocument') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-createDocument" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <DocumentPreview
                                isReadonly={isReadonly}
                                result={(part as any).output}
                                chatId={chatId}
                              />
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-updateDocument') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-updateDocument" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <DocumentToolResult
                                type="update"
                                result={(part as any).output}
                                isReadonly={isReadonly}
                                chatId={chatId}
                              />
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-requestSuggestions') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-requestSuggestions" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <DocumentToolResult
                                type="request-suggestions"
                                result={(part as any).output}
                                isReadonly={isReadonly}
                                chatId={chatId}
                              />
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-createAgent') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-createAgent" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-green-600">
                                  ✅ Agent Created Successfully
                                </div>
                                <div className="space-y-1">
                                  <div>
                                    <strong>Title:</strong>{' '}
                                    {(part as any).output.agent?.title}
                                  </div>
                                  <div>
                                    <strong>Description:</strong>{' '}
                                    {(part as any).output.agent?.description}
                                  </div>
                                  <div>
                                    <strong>ID:</strong>{' '}
                                    {(part as any).output.agent?.id}
                                  </div>
                                  {(part as any).output.workflow && (
                                    <div>
                                      <strong>Workflow:</strong>{' '}
                                      {(part as any).output.workflow.nodes}{' '}
                                      nodes,{' '}
                                      {(part as any).output.workflow.edges}{' '}
                                      connections
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-pythonRuntime' || (type as string) === 'tool-pythonRuntime') {
                const toolPart = part as any;
                const { toolCallId, state } = toolPart;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-pythonRuntime" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={toolPart.input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in toolPart.output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String(toolPart.output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-green-600">
                                  🐍 Python Code Prepared
                                </div>
                                <div className="space-y-1">
                                  <div>
                                    <strong>Description:</strong>{' '}
                                    {toolPart.output.description}
                                  </div>
                                  {toolPart.output.code && (
                                    <div>
                                      <AgentPythonExecutor
                                        code={toolPart.output.code}
                                        description={toolPart.output.description}
                                      />
                                    </div>
                                  )}
                                  {toolPart.output.output && !toolPart.output.code && (
                                    <div>
                                      <strong>Output:</strong>
                                      <div className="bg-gray-900 text-green-400 p-2 rounded mt-1 font-mono text-sm">
                                        <pre className="whitespace-pre-wrap">
                                          {toolPart.output.output}
                                        </pre>
                                      </div>
                                    </div>
                                  )}
                                  {toolPart.output.result && !toolPart.output.code && (
                                    <div>
                                      <strong>Result:</strong>{' '}
                                      <code className="bg-blue-100 px-1 rounded">
                                        {toolPart.output.result}
                                      </code>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-webSearch') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-webSearch" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-blue-600">
                                  🔍 Web Search Results
                                </div>
                                <div className="text-sm">
                                  <strong>Query:</strong>{' '}
                                  {(part as any).output.query}
                                </div>
                                <div className="text-sm">
                                  <strong>Type:</strong>{' '}
                                  {(part as any).output.type}
                                </div>
                                <div className="mt-3 p-3 bg-muted/50 rounded border-l-2 border-blue-200">
                                  <div className="whitespace-pre-wrap text-sm">
                                    {(part as any).output.results}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Source: {(part as any).output.source} •{' '}
                                  {new Date(
                                    (part as any).output.timestamp,
                                  ).toLocaleString()}
                                </div>
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-newsSearch') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-newsSearch" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-purple-600">
                                  📰 News Search Results
                                </div>
                                <div className="text-sm">
                                  <strong>Query:</strong>{' '}
                                  {(part as any).output.query}
                                </div>
                                <div className="text-sm">
                                  <strong>Timeframe:</strong>{' '}
                                  {(part as any).output.timeframe}
                                </div>
                                <div className="mt-3 p-3 bg-muted/50 rounded border-l-2 border-purple-200">
                                  <div className="whitespace-pre-wrap text-sm">
                                    {(part as any).output.results}
                                  </div>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Source: {(part as any).output.source} •{' '}
                                  {new Date(
                                    (part as any).output.timestamp,
                                  ).toLocaleString()}
                                </div>
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              // Agent-specific document search tools
              if (type === 'tool-searchDocuments') {
                const { toolCallId, state } = part as any;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-searchDocuments" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-green-600">
                                  🔍 Document Search Results
                                </div>
                                <div className="space-y-2">
                                  {(part as any).output.results?.map(
                                    (result: any, index: number) => (
                                      <div
                                        key={index}
                                        className="p-2 border rounded"
                                      >
                                        <div className="font-medium">
                                          {result.title}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                          Similarity:{' '}
                                          {(result.similarity * 100).toFixed(1)}
                                          %
                                        </div>
                                        <div className="text-sm">
                                          {result.content}
                                        </div>
                                        {result.metadata && (
                                          <div className="text-xs text-gray-500 mt-1">
                                            {result.metadata.fileName &&
                                              `File: ${result.metadata.fileName}`}
                                            {result.metadata.documentType &&
                                              ` | Type: ${result.metadata.documentType}`}
                                          </div>
                                        )}
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-findDocumentByTitle') {
                const { toolCallId, state } = part as any;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-findDocumentByTitle" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-blue-600">
                                  📄 Document Finder
                                </div>
                                {(part as any).output.found ? (
                                  <div className="space-y-2">
                                    <div className="text-sm text-green-600">
                                      Found {(part as any).output.count}{' '}
                                      document(s)
                                    </div>
                                    {(part as any).output.documents?.map(
                                      (doc: any, index: number) => (
                                        <div
                                          key={index}
                                          className="p-2 border rounded"
                                        >
                                          <div className="font-medium">
                                            {doc.title}
                                          </div>
                                          <div className="text-sm text-gray-600">
                                            ID: {doc.id}
                                          </div>
                                          {doc.metadata?.fileName && (
                                            <div className="text-sm text-gray-500">
                                              File: {doc.metadata.fileName}
                                            </div>
                                          )}
                                        </div>
                                      ),
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-600">
                                    {(part as any).output.message}
                                    {(part as any).output.suggestions && (
                                      <div className="mt-2">
                                        <div className="text-xs font-medium">
                                          Available documents:
                                        </div>
                                        <div className="text-xs text-gray-500">
                                          {(
                                            part as any
                                          ).output.suggestions.join(', ')}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-getDocumentMetadata') {
                const { toolCallId, state } = part as any;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-getDocumentMetadata" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-purple-600">
                                  📋 Document Metadata
                                </div>
                                {(part as any).output.found ? (
                                  <div className="space-y-2">
                                    <div className="p-2 border rounded">
                                      <div className="font-medium">
                                        {(part as any).output.document.title}
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        ID: {(part as any).output.document.id}
                                      </div>
                                      <div className="text-sm text-gray-500">
                                        Created:{' '}
                                        {new Date(
                                          (part as any).output.document
                                            .createdAt,
                                        ).toLocaleDateString()}
                                      </div>
                                      {(part as any).output.document
                                        .metadata && (
                                        <div className="mt-2 text-xs">
                                          <div className="font-medium">
                                            Metadata:
                                          </div>
                                          <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">
                                            {JSON.stringify(
                                              (part as any).output.document
                                                .metadata,
                                              null,
                                              2,
                                            )}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-600">
                                    {(part as any).output.message}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-searchSpecificDocument') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader
                      type="tool-searchSpecificDocument"
                      state={state}
                    />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-indigo-600">
                                  🎯 Specific Document Search
                                </div>
                                {(part as any).output.found ? (
                                  <div className="space-y-2">
                                    <div className="p-2 border rounded bg-blue-50">
                                      <div className="font-medium">
                                        {(part as any).output.document.title}
                                      </div>
                                      <div className="text-sm text-gray-600">
                                        ID: {(part as any).output.document.id}
                                      </div>
                                    </div>
                                    <div className="space-y-2">
                                      {(
                                        part as any
                                      ).output.searchResults?.results?.map(
                                        (result: any, index: number) => (
                                          <div
                                            key={index}
                                            className="p-2 border rounded"
                                          >
                                            <div className="text-sm text-gray-600">
                                              Similarity:{' '}
                                              {(
                                                result.similarity * 100
                                              ).toFixed(1)}
                                              %
                                            </div>
                                            <div className="text-sm">
                                              {result.content}
                                            </div>
                                          </div>
                                        ),
                                      )}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-600">
                                    {(part as any).output.message}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-searchImages') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-searchImages" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={(part as any).input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in (part as any).output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String((part as any).output.error)}
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                <div className="text-sm font-medium text-pink-600">
                                  🖼️ Image Search Results
                                </div>
                                <div className="space-y-2">
                                  {(part as any).output.results?.map(
                                    (result: any, index: number) => (
                                      <div
                                        key={index}
                                        className="p-2 border rounded"
                                      >
                                        <div className="font-medium">
                                          {result.title}
                                        </div>
                                        <div className="text-sm text-gray-600">
                                          Similarity:{' '}
                                          {(result.similarity * 100).toFixed(1)}
                                          %
                                        </div>
                                        <div className="text-sm">
                                          {result.content}
                                        </div>
                                        {result.metadata && (
                                          <div className="text-xs text-gray-500 mt-1">
                                            {result.metadata.fileName &&
                                              `File: ${result.metadata.fileName}`}
                                            {result.metadata.documentType &&
                                              ` | Type: ${result.metadata.documentType}`}
                                          </div>
                                        )}
                                      </div>
                                    ),
                                  )}
                                </div>
                                {(part as any).output.recommendedThreshold && (
                                  <div className="text-xs text-gray-500">
                                    {(part as any).output.recommendedThreshold}
                                  </div>
                                )}
                              </div>
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
            })}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return false;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="px-4 mx-auto w-full max-w-3xl group/message min-h-96"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="flex justify-center items-center rounded-full ring-1 size-8 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            Hmm...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
