'use client';

import { useEffect, useRef } from 'react';
import { artifactDefinitions } from './artifact';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';
import { useDataStream } from './data-stream-provider';

export function DataStreamHandler({ chatId }: { chatId: string }) {
  const { dataStream } = useDataStream();

  const { artifact, setArtifact, setMetadata } = useArtifact(chatId);
  const lastProcessedIndex = useRef(-1);

  useEffect(() => {
    if (!dataStream?.length) return;

    const newDeltas = dataStream.slice(lastProcessedIndex.current + 1);
    lastProcessedIndex.current = dataStream.length - 1;

    newDeltas.forEach((delta) => {
      const artifactDefinition = artifactDefinitions.find(
        (artifactDefinition) => artifactDefinition.kind === artifact.kind,
      );

      if (artifactDefinition?.onStreamPart) {
        artifactDefinition.onStreamPart({
          streamPart: delta,
          setArtifact,
          setMetadata,
        });
      }

      setArtifact((draftArtifact) => {
        if (!draftArtifact) {
          return { ...initialArtifactData, status: 'streaming' };
        }

        switch (delta.type) {
          case 'data-id':
            return {
              ...draftArtifact,
              documentId: delta.data,
              status: 'streaming',
            };

          case 'data-title':
            return {
              ...draftArtifact,
              title: delta.data,
              status: 'streaming',
            };

          case 'data-kind':
            return {
              ...draftArtifact,
              kind: delta.data,
              status: 'streaming',
            };

          case 'data-clear':
            return {
              ...draftArtifact,
              content: '',
              status: 'streaming',
            };

          case 'data-finish':
            return {
              ...draftArtifact,
              status: 'idle',
            };

          // Image generation data stream handlers
          case 'data-image-generation-start':
            return {
              ...draftArtifact,
              status: 'streaming',
              // Store image generation metadata
              imageGeneration: {
                prompt: delta.data.prompt,
                style: delta.data.style,
                aspectRatio: delta.data.aspectRatio,
                quality: delta.data.quality,
                status: 'generating',
              },
            };

          case 'data-image-generated':
            return {
              ...draftArtifact,
              status: 'streaming',
              // Update with generated image data
              imageGeneration: {
                ...draftArtifact.imageGeneration,
                status: 'completed',
                blobUrl: delta.data.blobUrl,
                mediaType: delta.data.mediaType,
                prompt: delta.data.prompt,
                style: delta.data.style,
                aspectRatio: delta.data.aspectRatio,
                quality: delta.data.quality,
              },
            };

          case 'data-image-generation-error':
            return {
              ...draftArtifact,
              status: 'streaming',
              // Update with error information
              imageGeneration: {
                ...draftArtifact.imageGeneration,
                status: 'error',
                error: delta.data.error,
              },
            };

          default:
            return draftArtifact;
        }
      });
    });
  }, [dataStream, setArtifact, setMetadata, artifact]);

  return null;
}
