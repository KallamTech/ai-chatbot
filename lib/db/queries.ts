import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lt,
  type SQL,
  ilike,
  or,
  sql,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import {
  user,
  chat,
  type User,
  document,
  type Suggestion,
  suggestion,
  message,
  vote,
  type DBMessage,
  type Chat,
  stream,
  agent,
  type Agent,
  dataPool,
  type DataPool,
  agentDataPool,
  dataPoolDocument,
  type DataPoolDocument,
  workflowNode,
  type WorkflowNode,
  workflowEdge,
  type WorkflowEdge,
} from './schema';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from './utils';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';

// Optionally, if not using email/pass login, you can
// use the Drizzle adapter for Auth.js / NextAuth
// https://authjs.dev/reference/adapter/drizzle

// biome-ignore lint: Forbidden non-null assertion.
const client = postgres(process.env.POSTGRES_URL!);
const db = drizzle(client);

export async function getUser(email: string): Promise<Array<User>> {
  try {
    return await db.select().from(user).where(eq(user.email, email));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get user by email',
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);

  try {
    return await db.insert(user).values({ email, password: hashedPassword });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create user');
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());

  try {
    return await db.insert(user).values({ email, password }).returning({
      id: user.id,
      email: user.email,
    });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create guest user',
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
  agentId,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
  agentId?: string;
}) {
  try {
    return await db.insert(chat).values({
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      agentId,
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    await db.delete(vote).where(eq(vote.chatId, id));
    await db.delete(message).where(eq(message.chatId, id));
    await db.delete(stream).where(eq(stream.chatId, id));

    const [chatsDeleted] = await db
      .delete(chat)
      .where(eq(chat.id, id))
      .returning();
    return chatsDeleted;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete chat by id',
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    const extendedLimit = limit + 1;

    const query = (whereCondition?: SQL<any>) =>
      db
        .select()
        .from(chat)
        .where(
          whereCondition
            ? and(whereCondition, eq(chat.userId, id))
            : eq(chat.userId, id),
        )
        .orderBy(desc(chat.createdAt))
        .limit(extendedLimit);

    let filteredChats: Array<Chat> = [];

    if (startingAfter) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, startingAfter))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${startingAfter} not found`,
        );
      }

      filteredChats = await query(gt(chat.createdAt, selectedChat.createdAt));
    } else if (endingBefore) {
      const [selectedChat] = await db
        .select()
        .from(chat)
        .where(eq(chat.id, endingBefore))
        .limit(1);

      if (!selectedChat) {
        throw new ChatSDKError(
          'not_found:database',
          `Chat with id ${endingBefore} not found`,
        );
      }

      filteredChats = await query(lt(chat.createdAt, selectedChat.createdAt));
    } else {
      filteredChats = await query();
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get chats by user id',
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const [selectedChat] = await db.select().from(chat).where(eq(chat.id, id));
    return selectedChat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    return await db.insert(message).values(messages);
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    return await db
      .select()
      .from(message)
      .where(eq(message.chatId, id))
      .orderBy(asc(message.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get messages by chat id',
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const [existingVote] = await db
      .select()
      .from(vote)
      .where(and(eq(vote.messageId, messageId)));

    if (existingVote) {
      return await db
        .update(vote)
        .set({ isUpvoted: type === 'up' })
        .where(and(eq(vote.messageId, messageId), eq(vote.chatId, chatId)));
    }
    return await db.insert(vote).values({
      chatId,
      messageId,
      isUpvoted: type === 'up',
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to vote message');
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return await db.select().from(vote).where(eq(vote.chatId, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get votes by chat id',
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    return await db
      .insert(document)
      .values({
        id,
        title,
        kind,
        content,
        userId,
        createdAt: new Date(),
      })
      .returning();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save document');
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const documents = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(asc(document.createdAt));

    return documents;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get documents by id',
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const [selectedDocument] = await db
      .select()
      .from(document)
      .where(eq(document.id, id))
      .orderBy(desc(document.createdAt));

    return selectedDocument;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document by id',
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    await db
      .delete(suggestion)
      .where(
        and(
          eq(suggestion.documentId, id),
          gt(suggestion.documentCreatedAt, timestamp),
        ),
      );

    return await db
      .delete(document)
      .where(and(eq(document.id, id), gt(document.createdAt, timestamp)))
      .returning();
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete documents by id after timestamp',
    );
  }
}

export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    return await db.insert(suggestion).values(suggestions);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to save suggestions',
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return await db
      .select()
      .from(suggestion)
      .where(and(eq(suggestion.documentId, documentId)));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get suggestions by document id',
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    return await db.select().from(message).where(eq(message.id, id));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message by id',
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const messagesToDelete = await db
      .select({ id: message.id })
      .from(message)
      .where(
        and(eq(message.chatId, chatId), gte(message.createdAt, timestamp)),
      );

    const messageIds = messagesToDelete.map((message) => message.id);

    if (messageIds.length > 0) {
      await db
        .delete(vote)
        .where(
          and(eq(vote.chatId, chatId), inArray(vote.messageId, messageIds)),
        );

      return await db
        .delete(message)
        .where(
          and(eq(message.chatId, chatId), inArray(message.id, messageIds)),
        );
    }
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete messages by chat id after timestamp',
    );
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    return await db.update(chat).set({ visibility }).where(eq(chat.id, chatId));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to update chat visibility by id',
    );
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000,
    );

    const [stats] = await db
      .select({ count: count(message.id) })
      .from(message)
      .innerJoin(chat, eq(message.chatId, chat.id))
      .where(
        and(
          eq(chat.userId, id),
          gte(message.createdAt, twentyFourHoursAgo),
          eq(message.role, 'user'),
        ),
      )
      .execute();

    return stats?.count ?? 0;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get message count by user id',
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db
      .insert(stream)
      .values({ id: streamId, chatId, createdAt: new Date() });
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create stream id',
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamIds = await db
      .select({ id: stream.id })
      .from(stream)
      .where(eq(stream.chatId, chatId))
      .orderBy(asc(stream.createdAt))
      .execute();

    return streamIds.map(({ id }) => id);
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get stream ids by chat id',
    );
  }
}

// Agent queries
export async function createAgent({
  title,
  description,
  userId,
}: {
  title: string;
  description: string;
  userId: string;
}): Promise<Agent> {
  try {
    const now = new Date();
    const [newAgent] = await db
      .insert(agent)
      .values({
        id: generateUUID(),
        title,
        description,
        userId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return newAgent;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create agent');
  }
}

export async function getAgentsByUserId({
  userId,
}: {
  userId: string;
}): Promise<Array<Agent>> {
  try {
    return await db
      .select()
      .from(agent)
      .where(eq(agent.userId, userId))
      .orderBy(desc(agent.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get agents by user ID',
    );
  }
}

export async function getAgentById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<Agent | null> {
  try {
    const [result] = await db
      .select()
      .from(agent)
      .where(and(eq(agent.id, id), eq(agent.userId, userId)));

    return result || null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get agent by ID');
  }
}

export async function deleteAgent({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<void> {
  try {
    await db
      .delete(agent)
      .where(and(eq(agent.id, id), eq(agent.userId, userId)));
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete agent');
  }
}

// Data pool queries
export async function createDataPool({
  userId,
  name,
  description,
}: {
  userId: string;
  name: string;
  description?: string;
}): Promise<DataPool> {
  try {
    const now = new Date();
    const [newDataPool] = await db
      .insert(dataPool)
      .values({
        id: generateUUID(),
        userId,
        name,
        description: description || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return newDataPool;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create data pool',
    );
  }
}

export async function getDataPoolsByUserId({
  userId,
}: {
  userId: string;
}): Promise<Array<DataPool>> {
  try {
    return await db
      .select()
      .from(dataPool)
      .where(eq(dataPool.userId, userId))
      .orderBy(desc(dataPool.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get data pools by user ID',
    );
  }
}

export async function getDataPoolById({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<DataPool | null> {
  try {
    const [result] = await db
      .select()
      .from(dataPool)
      .where(and(eq(dataPool.id, id), eq(dataPool.userId, userId)));

    return result || null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get data pool by ID',
    );
  }
}

export async function getDataPoolByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<DataPool | null> {
  try {
    // For backward compatibility, get the first data pool connected to this agent
    const [result] = await db
      .select({
        id: dataPool.id,
        userId: dataPool.userId,
        name: dataPool.name,
        description: dataPool.description,
        createdAt: dataPool.createdAt,
        updatedAt: dataPool.updatedAt,
      })
      .from(dataPool)
      .innerJoin(agentDataPool, eq(dataPool.id, agentDataPool.dataPoolId))
      .where(eq(agentDataPool.agentId, agentId))
      .limit(1);

    return result || null;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get data pool by agent ID',
    );
  }
}

export async function getDataPoolsByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<Array<DataPool>> {
  try {
    return await db
      .select({
        id: dataPool.id,
        userId: dataPool.userId,
        name: dataPool.name,
        description: dataPool.description,
        createdAt: dataPool.createdAt,
        updatedAt: dataPool.updatedAt,
      })
      .from(dataPool)
      .innerJoin(agentDataPool, eq(dataPool.id, agentDataPool.dataPoolId))
      .where(eq(agentDataPool.agentId, agentId))
      .orderBy(desc(dataPool.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get data pools by agent ID',
    );
  }
}

export async function connectAgentToDataPool({
  agentId,
  dataPoolId,
}: {
  agentId: string;
  dataPoolId: string;
}): Promise<void> {
  try {
    await db
      .insert(agentDataPool)
      .values({
        id: generateUUID(),
        agentId,
        dataPoolId,
        createdAt: new Date(),
      })
      .onConflictDoNothing(); // Ignore if connection already exists
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to connect agent to data pool',
    );
  }
}

export async function disconnectAgentFromDataPool({
  agentId,
  dataPoolId,
}: {
  agentId: string;
  dataPoolId: string;
}): Promise<void> {
  try {
    await db
      .delete(agentDataPool)
      .where(
        and(
          eq(agentDataPool.agentId, agentId),
          eq(agentDataPool.dataPoolId, dataPoolId),
        ),
      );
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to disconnect agent from data pool',
    );
  }
}

export async function getAgentsByDataPoolId({
  dataPoolId,
}: {
  dataPoolId: string;
}): Promise<Array<Agent>> {
  try {
    return await db
      .select({
        id: agent.id,
        title: agent.title,
        description: agent.description,
        userId: agent.userId,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      })
      .from(agent)
      .innerJoin(agentDataPool, eq(agent.id, agentDataPool.agentId))
      .where(eq(agentDataPool.dataPoolId, dataPoolId))
      .orderBy(desc(agent.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get agents by data pool ID',
    );
  }
}

export async function deleteDataPool({
  id,
  userId,
}: {
  id: string;
  userId: string;
}): Promise<void> {
  try {
    await db
      .delete(dataPool)
      .where(and(eq(dataPool.id, id), eq(dataPool.userId, userId)));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete data pool',
    );
  }
}

// Data pool document queries
export async function createDataPoolDocument({
  dataPoolId,
  title,
  content,
  metadata,
}: {
  dataPoolId: string;
  title: string;
  content: string;
  metadata?: Record<string, any>;
}): Promise<DataPoolDocument> {
  try {
    const [newDocument] = await db
      .insert(dataPoolDocument)
      .values({
        id: generateUUID(),
        dataPoolId,
        title,
        content,
        metadata: metadata || null,
        createdAt: new Date(),
      })
      .returning();

    return newDocument;
  } catch (error) {
    console.error('Database error creating data pool document:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create data pool document',
    );
  }
}

export async function deleteDataPoolDocument({
  id,
  dataPoolId,
}: {
  id: string;
  dataPoolId: string;
}): Promise<void> {
  try {
    await db
      .delete(dataPoolDocument)
      .where(
        and(
          eq(dataPoolDocument.id, id),
          eq(dataPoolDocument.dataPoolId, dataPoolId),
        ),
      );
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to delete data pool document',
    );
  }
}

// Workflow node queries
export async function createWorkflowNode({
  agentId,
  name,
  description,
  systemPrompt,
  position,
  nodeType,
  config,
}: {
  agentId: string;
  name: string;
  description: string;
  systemPrompt: string;
  position: { x: number; y: number };
  nodeType:
    | 'rag'
    | 'transform'
    | 'filter'
    | 'aggregate'
    | 'runtime'
    | 'websearch'
    | 'news'
    | 'deepresearch'
    | 'imagegeneration';
  config?: Record<string, any>;
}): Promise<WorkflowNode> {
  try {
    const [newNode] = await db
      .insert(workflowNode)
      .values({
        id: generateUUID(),
        agentId,
        name,
        description,
        systemPrompt,
        position,
        nodeType,
        config: config || null,
        createdAt: new Date(),
      })
      .returning();

    return newNode;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create workflow node',
    );
  }
}

export async function getWorkflowNodesByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<Array<WorkflowNode>> {
  try {
    return await db
      .select()
      .from(workflowNode)
      .where(eq(workflowNode.agentId, agentId))
      .orderBy(asc(workflowNode.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get workflow nodes by agent ID',
    );
  }
}

// Workflow edge queries
export async function createWorkflowEdge({
  agentId,
  sourceNodeId,
  targetNodeId,
}: {
  agentId: string;
  sourceNodeId: string;
  targetNodeId: string;
}): Promise<WorkflowEdge> {
  try {
    const [newEdge] = await db
      .insert(workflowEdge)
      .values({
        id: generateUUID(),
        agentId,
        sourceNodeId,
        targetNodeId,
        createdAt: new Date(),
      })
      .returning();

    return newEdge;
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to create workflow edge',
    );
  }
}

export async function getWorkflowEdgesByAgentId({
  agentId,
}: {
  agentId: string;
}): Promise<Array<WorkflowEdge>> {
  try {
    return await db
      .select()
      .from(workflowEdge)
      .where(eq(workflowEdge.agentId, agentId))
      .orderBy(asc(workflowEdge.createdAt));
  } catch (error) {
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get workflow edges by agent ID',
    );
  }
}

/**
 * Search documents in a datapool using SQL keyword search
 */
export async function searchDataPoolDocuments({
  dataPoolId,
  query,
  limit = 50,
  offset = 0,
  title,
}: {
  dataPoolId: string;
  query: string;
  limit?: number;
  offset?: number;
  title?: string;
}): Promise<Array<DataPoolDocument & { relevanceScore: number }>> {
  try {
    // Split query into individual terms for better matching
    const searchTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2); // Filter out short terms

    if (searchTerms.length === 0) {
      return [];
    }

    // Create search conditions for title, content, and metadata
    const titleConditions = searchTerms.map((term) =>
      ilike(dataPoolDocument.title, `%${term}%`),
    );
    const contentConditions = searchTerms.map((term) =>
      ilike(dataPoolDocument.content, `%${term}%`),
    );
    const metadataConditions = searchTerms.map(
      (term) => sql`${dataPoolDocument.metadata}::text ILIKE ${`%${term}%`}`,
    );

    // Combine all conditions with OR
    const allConditions = [
      ...titleConditions,
      ...contentConditions,
      ...metadataConditions,
    ];

    // Build the main WHERE conditions
    const whereConditions = [
      eq(dataPoolDocument.dataPoolId, dataPoolId),
      or(...allConditions),
    ];

    // Add title filter if provided
    if (title) {
      whereConditions.push(ilike(dataPoolDocument.title, `%${title}%`));
    }

    // Use a simpler approach with basic scoring
    const results = await db
      .select()
      .from(dataPoolDocument)
      .where(and(...whereConditions))
      .orderBy(desc(dataPoolDocument.createdAt))
      .limit(limit)
      .offset(offset);

    // Calculate simple relevance scores
    const resultsWithScores = results.map((doc) => {
      let score = 0;
      const lowerQuery = query.toLowerCase();
      const lowerTitle = doc.title.toLowerCase();
      const lowerContent = doc.content.toLowerCase();
      const lowerMetadata = JSON.stringify(doc.metadata || {}).toLowerCase();

      // Title matches get highest weight
      if (lowerTitle.includes(lowerQuery)) score += 10;
      searchTerms.forEach((term) => {
        if (lowerTitle.includes(term)) score += 5;
      });

      // Content matches get medium weight
      if (lowerContent.includes(lowerQuery)) score += 3;
      searchTerms.forEach((term) => {
        if (lowerContent.includes(term)) score += 1;
      });

      // Metadata matches get lowest weight
      if (lowerMetadata.includes(lowerQuery)) score += 2;
      searchTerms.forEach((term) => {
        if (lowerMetadata.includes(term)) score += 0.5;
      });

      return {
        ...doc,
        relevanceScore: score,
      };
    });

    // Sort by relevance score
    return resultsWithScores.sort(
      (a, b) => b.relevanceScore - a.relevanceScore,
    );
  } catch (error) {
    console.error('Error searching documents:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to search documents',
    );
  }
}

/**
 * Search documents by title in a datapool using SQL
 * Optimized version that performs filtering in the database instead of JavaScript
 */
export async function searchDataPoolDocumentsByTitle({
  dataPoolId,
  title,
  exactMatch = false,
  limit = 50,
}: {
  dataPoolId: string;
  title: string;
  exactMatch?: boolean;
  limit?: number;
}): Promise<Array<DataPoolDocument>> {
  try {
    const searchTitle = title.toLowerCase();

    let whereCondition: SQL | undefined;

    if (exactMatch) {
      // Exact match on title (case-insensitive)
      whereCondition = ilike(dataPoolDocument.title, searchTitle);
    } else {
      // Partial match on title, filename in metadata, and search tags
      const titleCondition = ilike(dataPoolDocument.title, `%${searchTitle}%`);
      const fileNameCondition = sql`(${dataPoolDocument.metadata}>>'fileName' ILIKE ${`%${searchTitle}%`})`;
      const searchTagsCondition = sql`(${dataPoolDocument.metadata}>>'searchTags' ILIKE ${`%${searchTitle}%`})`;

      whereCondition = or(
        titleCondition,
        fileNameCondition,
        searchTagsCondition,
      );
    }

    const results = await db
      .select()
      .from(dataPoolDocument)
      .where(and(eq(dataPoolDocument.dataPoolId, dataPoolId), whereCondition))
      .orderBy(desc(dataPoolDocument.createdAt))
      .limit(limit);

    return results;
  } catch (error) {
    console.error('Error searching documents by title:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to search documents by title',
    );
  }
}

/**
 * Get document titles for suggestions (used when no matches found)
 */
export async function getDataPoolDocumentTitles({
  dataPoolId,
  limit = 5,
}: {
  dataPoolId: string;
  limit?: number;
}): Promise<Array<string>> {
  try {
    const results = await db
      .select({ title: dataPoolDocument.title })
      .from(dataPoolDocument)
      .where(eq(dataPoolDocument.dataPoolId, dataPoolId))
      .orderBy(desc(dataPoolDocument.createdAt))
      .limit(limit);

    return results.map((doc) => doc.title);
  } catch (error) {
    console.error('Error getting document titles:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to get document titles',
    );
  }
}

/**
 * Fetch datapool documents with SQL filtering on title and metadata.fileName
 */
export async function getDataPoolDocumentsFiltered({
  dataPoolId,
  title,
  fileName,
  limit = 50,
  offset = 0,
}: {
  dataPoolId: string;
  title?: string;
  fileName?: string;
  limit?: number;
  offset?: number;
}): Promise<Array<DataPoolDocument>> {
  try {
    const whereConditions: SQL<any>[] = [
      eq(dataPoolDocument.dataPoolId, dataPoolId),
    ];

    if (title && title.trim().length > 0) {
      whereConditions.push(ilike(dataPoolDocument.title, `%${title}%`));
    }

    if (fileName && fileName.trim().length > 0) {
      // Match JSON metadata containing a fileName with partial match
      whereConditions.push(
        sql`(${dataPoolDocument.metadata}->>'fileName' ILIKE ${`%${fileName}%`})`,
      );
    }

    const results = await db
      .select()
      .from(dataPoolDocument)
      .where(and(...whereConditions))
      .orderBy(desc(dataPoolDocument.createdAt))
      .limit(limit)
      .offset(offset);

    return results;
  } catch (error) {
    console.error('Error fetching datapool documents with filters:', error);
    throw new ChatSDKError(
      'bad_request:database',
      'Failed to fetch datapool documents',
    );
  }
}
