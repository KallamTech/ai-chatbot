import 'server-only';

import { tool } from 'ai';
import { z } from 'zod';
import { getDocumentById } from '@/lib/db/queries';

export const getDocumentMetadata = () =>
  tool({
    description:
      'Get detailed metadata and information about a specific document',
    inputSchema: z.object({
      documentId: z.string().describe('ID of the document to get metadata for'),
    }),
    execute: async ({ documentId }) => {
      console.log('Getting metadata for document:', documentId);

      try {
        // Get document directly by ID from database
        const document = await getDocumentById({ id: documentId });

        if (!document) {
          return {
            found: false,
            message: `Document with ID ${documentId} not found`,
          };
        }

        return {
          found: true,
          document: {
            id: document.id,
            title: document.title,
            content: document.content,
            kind: document.kind,
            createdAt: document.createdAt,
          },
        };
      } catch (error) {
        console.error('Error getting document metadata:', error);
        return {
          found: false,
          error: 'Failed to get document metadata',
        };
      }
    },
  });
