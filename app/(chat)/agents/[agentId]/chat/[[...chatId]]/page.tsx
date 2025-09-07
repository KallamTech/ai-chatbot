import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import {
  getAgentById,
  getChatById,
  getMessagesByChatId,
} from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { convertToUIMessages, generateUUID } from '@/lib/utils';

/**
 * Filters out messages before the last assistant message containing "An error has occurred"
 * @param messages Array of database messages
 * @returns Filtered array of messages
 */
function filterMessagesBeforeLastError(messages: any[]): any[] {
  // Find the index of the last assistant message with "An error has occurred"
  let lastErrorIndex = -1;

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role === 'assistant' && message.parts) {
      // Check if any part contains the error text
      const hasError = message.parts.some(
        (part: any) =>
          part.type === 'text' &&
          part.text &&
          part.text.includes('An error has occurred'),
      );

      if (hasError) {
        lastErrorIndex = i;
        break;
      }
    }
  }

  // If no error message found, return all messages
  if (lastErrorIndex === -1) {
    return messages;
  }

  // Return messages starting from the error message (inclusive)
  return messages.slice(lastErrorIndex);
}

export default async function AgentChatPage(props: {
  params: Promise<{ agentId: string; chatId?: string[] }>;
}) {
  const params = await props.params;
  const { agentId, chatId: chatIdArray } = params;

  // Extract chatId from optional catch-all route
  const chatId = chatIdArray?.[0];

  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (!session.user) {
    return null;
  }

  // Verify the agent exists and belongs to the user
  const agent = await getAgentById({
    id: agentId,
    userId: session.user.id,
  });

  if (!agent) {
    notFound();
  }

  let finalChatId: string;
  let uiMessages: any[];
  let visibility: 'private' | 'public' = 'private';
  let isReadonly = false;
  let autoResume = false;

  if (chatId) {
    // Existing chat - load from database
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      notFound();
    }

    // Verify chat belongs to user
    if (chat.userId !== session.user.id) {
      notFound();
    }

    // Verify chat is associated with this agent
    if (chat.agentId !== agentId) {
      notFound();
    }

    finalChatId = chat.id;
    visibility = chat.visibility;
    isReadonly = session?.user?.id !== chat.userId;
    autoResume = true;

    // Get messages for this chat
    const messagesFromDb = await getMessagesByChatId({
      id: chatId,
    });

    // Filter out messages before the last assistant message with "An error has occurred"
    const filteredMessages = filterMessagesBeforeLastError(messagesFromDb);

    uiMessages = convertToUIMessages(filteredMessages);
  } else {
    // New chat - generate ID and create initial message
    finalChatId = generateUUID();
    autoResume = false;

    // Create initial message to introduce the agent
    uiMessages = [
      {
        id: generateUUID(),
        role: 'assistant' as const,
        parts: [
          {
            type: 'text' as const,
            text: `Hello! I'm ${agent.title}, your specialized AI agent. ${agent.description}\n\nI can help you with tasks related to my specific capabilities. What would you like to work on today?`,
          },
        ],
        metadata: {
          createdAt: new Date().toISOString(),
        },
      },
    ];
  }

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');
  const selectedModel = chatModelFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        key={finalChatId}
        id={finalChatId}
        initialMessages={uiMessages}
        initialChatModel={selectedModel}
        initialVisibilityType={visibility}
        isReadonly={isReadonly}
        session={session}
        autoResume={autoResume}
        agentId={agentId}
        chatData={{ agentId }}
      />
      <DataStreamHandler chatId={finalChatId} />
    </>
  );
}
