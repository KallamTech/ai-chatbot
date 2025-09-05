import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getChatById, getMessagesByChatId } from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { convertToUIMessages } from '@/lib/utils';

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
      const hasError = message.parts.some((part: any) =>
        part.type === 'text' && part.text && part.text.includes('An error has occurred')
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

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (chat.visibility === 'private') {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  // Filter out messages before the last assistant message with "An error has occurred"
  const filteredMessages = filterMessagesBeforeLastError(messagesFromDb);

  const uiMessages = convertToUIMessages(filteredMessages);

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');
  const selectedModel = chatModelFromCookie?.value || DEFAULT_CHAT_MODEL;

  return (
    <>
      <Chat
        id={chat.id}
        initialMessages={uiMessages}
        initialChatModel={selectedModel}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        session={session}
        autoResume={true}
        chatData={{ agentId: chat.agentId }}
      />
      <DataStreamHandler chatId={chat.id} />
    </>
  );
}
