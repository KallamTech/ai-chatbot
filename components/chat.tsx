'use client';

import { DefaultChatTransport } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector, useArtifact } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
  agentId: propAgentId,
  chatData,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
  agentId?: string;
  chatData?: { agentId?: string | null };
}) {
  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();

  const [input, setInput] = useState<string>('');
  const [selectedModelId, setSelectedModelId] =
    useState<string>(initialChatModel);
  const [errorHandled, setErrorHandled] = useState<boolean>(false);

  // Determine the effective agentId from multiple sources
  // Priority: prop from route > database
  const effectiveAgentId = propAgentId || chatData?.agentId || undefined;

  // Preserve agentId with a ref to prevent it from becoming undefined
  const agentIdRef = useRef(effectiveAgentId);

  // Update agentIdRef when effectiveAgentId changes
  useEffect(() => {
    agentIdRef.current = effectiveAgentId;
    if (effectiveAgentId) {
      console.log('🔧 Chat: Using agentId:', effectiveAgentId);
    }
  }, [effectiveAgentId]);

  // Use a ref to track the current selectedModelId for API calls
  const selectedModelIdRef = useRef(selectedModelId);

  // Update the ref whenever selectedModelId changes
  useEffect(() => {
    selectedModelIdRef.current = selectedModelId;
    console.log('Chat: selectedModelId changed to:', selectedModelId);
  }, [selectedModelId]);

  // Simple handler for model changes
  const handleModelChange = (modelId: string) => {
    console.log('🔥 Chat: handleModelChange called with:', modelId);
    setSelectedModelId(modelId);
  };

  // Clear error when sending a new message
  const handleSendMessage = async (message: any) => {
    console.log('Chat: handleSendMessage called with message parts:', message.parts?.length || 0);
    console.log('Chat: Current attachments count:', attachments.length);
    setErrorHandled(false); // Reset error handled state when sending new message
    return sendMessage(message);
  };

  const {
    messages,
    setMessages,
    sendMessage,
    status: rawStatus,
    stop,
    regenerate,
    resumeStream,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: agentIdRef.current
        ? `/api/agents/${agentIdRef.current}/chat`
        : '/api/chat',
      fetch: (input, init) => {
        // Add a 5-minute timeout for chat requests
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000);

        return fetchWithErrorHandlers(input, {
          ...init,
          signal: controller.signal,
        }).finally(() => {
          clearTimeout(timeoutId);
        });
      },
      prepareSendMessagesRequest({ messages, id, body }) {
        const currentAgentId = agentIdRef.current;
        const apiRoute = currentAgentId
          ? `/api/agents/${currentAgentId}/chat`
          : '/api/chat';
        console.log('🚀 API: prepareSendMessagesRequest called');
        console.log('🚀 API: Using route:', apiRoute);
        console.log('🚀 API: currentAgentId:', currentAgentId);
        console.log('🚀 API: selectedModelId:', selectedModelIdRef.current);
        return {
          body: {
            id,
            message: messages.at(-1),
            selectedChatModel: selectedModelIdRef.current,
            selectedVisibilityType: visibilityType,
            ...body,
          },
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      console.log('Chat: onError called with error:', error.message);
      const errorMessage = error instanceof ChatSDKError
        ? error.message
        : 'An unexpected error occurred. Please try again.';

      console.log('Chat: Error message:', errorMessage);

      toast({
        type: 'error',
        description: errorMessage,
      });

      // Replace the last empty assistant message with an error message
      setMessages((messages) => {
        const newMessages = [...messages];
        const lastMessage = newMessages[newMessages.length - 1];

        if (lastMessage && lastMessage.role === 'assistant' &&
            (!lastMessage.parts || lastMessage.parts.length === 0 ||
             (lastMessage.parts.length === 1 && lastMessage.parts[0].type === 'text' && !lastMessage.parts[0].text))) {
          // Replace empty assistant message with error message
          newMessages[newMessages.length - 1] = {
            ...lastMessage,
            parts: [{ type: 'text', text: errorMessage }],
          };
        } else {
          // Add error message as new assistant message
          newMessages.push({
            id: generateUUID(),
            role: 'assistant',
            parts: [{ type: 'text', text: errorMessage }],
          });
        }

        return newMessages;
      });

            // Mark error as handled and force stop the generation
      console.log('Chat: Setting errorHandled to true and calling stop()');
      setErrorHandled(true);
      console.log('Chat: Clearing attachments directly in error handler, current count:', attachments.length);
      setAttachments([]);

      // Completely reset messages to initial state to clear any pending state
      console.log('Chat: Completely resetting messages to initial state');
      setMessages(initialMessages);

      stop();

      // Force reset status after a short delay
      setTimeout(() => {
        console.log('Chat: Force resetting status after timeout');
        setErrorHandled(false);
      }, 100);
    },
  });

  // Override status to treat 'error' as 'ready' when we've handled the error
  const status = errorHandled && rawStatus === 'error' ? 'ready' : rawStatus;

  // Debug logging
  useEffect(() => {
    console.log('Chat: Status changed - rawStatus:', rawStatus, 'status:', status, 'errorHandled:', errorHandled);
    console.log('Chat: Status override logic - errorHandled && rawStatus === "error":', errorHandled && rawStatus === 'error');
  }, [rawStatus, status, errorHandled]);

  // Reset errorHandled when status changes to something other than 'error'
  useEffect(() => {
    if (rawStatus !== 'error') {
      setErrorHandled(false);
    }
  }, [rawStatus]);



  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);

  // Log attachment changes
  useEffect(() => {
    console.log('Chat: Attachments changed, count:', attachments.length);
  }, [attachments]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible, id);
  const { setArtifact } = useArtifact(id);

  // Reset artifact visibility when opening a chat (unless actively streaming)
  useEffect(() => {
    setArtifact((currentArtifact) => {
      // Only hide the artifact if it's not currently streaming
      if (currentArtifact.status !== 'streaming' && currentArtifact.isVisible) {
        return {
          ...currentArtifact,
          isVisible: false,
        };
      }
      return currentArtifact;
    });
  }, [id, setArtifact]); // Reset when chat ID changes

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedModelId={selectedModelId}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
          onModelChange={handleModelChange}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          regenerate={regenerate}
          sendMessage={handleSendMessage}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <div className="sticky bottom-0 flex gap-2 px-4 pb-4 mx-auto w-full bg-background md:pb-6 md:max-w-3xl z-[1] border-t-0">
          {!isReadonly && (
            <MultimodalInput
              chatId={id}
              input={input}
              setInput={setInput}
              status={rawStatus}
              stop={stop}
              attachments={attachments}
              setAttachments={setAttachments}
              messages={messages}
              setMessages={setMessages}
              sendMessage={handleSendMessage}
              selectedVisibilityType={visibilityType}
            />
          )}
        </div>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        status={rawStatus}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        sendMessage={handleSendMessage}
        messages={messages}
        setMessages={setMessages}
        regenerate={regenerate}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
      />
    </>
  );
}
