import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import { getAgentById } from '@/lib/db/queries';
import { DataStreamHandler } from '@/components/data-stream-handler';
import { DEFAULT_CHAT_MODEL } from '@/lib/ai/models';
import { generateUUID } from '@/lib/utils';

export default async function AgentChatPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;

  const session = await auth();

  if (!session) {
    redirect('/api/auth/guest');
  }

  if (!session.user) {
    return null;
  }

  // Verify the agent exists and belongs to the user
  const agent = await getAgentById({
    id,
    userId: session.user.id,
  });

  if (!agent) {
    notFound();
  }

  // Generate a new chat ID for this agent conversation
  const chatId = generateUUID();

  // Create initial message to introduce the agent
  const initialMessages = [
    {
      id: generateUUID(),
      role: 'assistant' as const,
      parts: [
        {
          type: 'text' as const,
          text: `Hello! I'm ${agent.title}, your specialized AI agent. ${agent.description}\n\nI can help you with tasks related to my specific capabilities. What would you like to work on today?`
        }
      ],
      metadata: {
        createdAt: new Date().toISOString(),
      },
    }
  ];

  const cookieStore = await cookies();
  const chatModelFromCookie = cookieStore.get('chat-model');

  if (!chatModelFromCookie) {
    return (
      <>
        <Chat
          key={chatId}
          id={chatId}
          initialMessages={initialMessages}
          initialChatModel={DEFAULT_CHAT_MODEL}
          initialVisibilityType="private"
          isReadonly={false}
          session={session}
          autoResume={false}
          agentId={id}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <Chat
        key={chatId}
        id={chatId}
        initialMessages={initialMessages}
        initialChatModel={chatModelFromCookie.value}
        initialVisibilityType="private"
        isReadonly={false}
        session={session}
        autoResume={false}
        agentId={id}
      />
      <DataStreamHandler />
    </>
  );
}
