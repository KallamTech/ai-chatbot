import { generateUUID } from '@/lib/utils';
import { tool, type UIMessageStreamWriter } from 'ai';
import { z } from 'zod';
import type { Session } from 'next-auth';
import {
  artifactKinds,
  documentHandlersByArtifactKind,
} from '@/lib/artifacts/server';
import type { ChatMessage } from '@/lib/types';

interface CreateDocumentProps {
  session: Session;
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const createDocument = ({ session, dataStream }: CreateDocumentProps) =>
  tool({
    description:
      "Create a document following the user's specific instructions and requirements. Generate content that precisely matches what the user requested, including format, style, structure, and any specific details mentioned. The userInstructions parameter contains the full context of what the user wants created.",
    inputSchema: z.object({
      title: z
        .string()
        .describe(
          "The title or topic of the document. Should capture the user's specific request and requirements.",
        ),
      kind: z
        .enum(artifactKinds)
        .describe(
          "The type of document to create: text, code, image, or sheet. Choose based on user's specific needs.",
        ),
      userInstructions: z
        .string()
        .describe(
          "The user's original instructions and requirements for the document. This provides the full context of what the user wants created.",
        ),
    }),
    execute: async ({ title, kind, userInstructions }) => {
      const id = generateUUID();

      dataStream.write({
        type: 'data-kind',
        data: kind,
        transient: true,
      });

      dataStream.write({
        type: 'data-id',
        data: id,
        transient: true,
      });

      dataStream.write({
        type: 'data-title',
        data: title,
        transient: true,
      });

      dataStream.write({
        type: 'data-clear',
        data: null,
        transient: true,
      });

      const documentHandler = documentHandlersByArtifactKind.find(
        (documentHandlerByArtifactKind) =>
          documentHandlerByArtifactKind.kind === kind,
      );

      if (!documentHandler) {
        throw new Error(`No document handler found for kind: ${kind}`);
      }

      await documentHandler.onCreateDocument({
        id,
        title,
        userInstructions,
        dataStream,
        session,
      });

      dataStream.write({ type: 'data-finish', data: null, transient: true });

      return {
        id,
        title,
        kind,
        content: 'A document was created and is now visible to the user.',
      };
    },
  });
