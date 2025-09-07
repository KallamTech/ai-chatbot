import 'server-only';

import { tool, generateText } from 'ai';
import { z } from 'zod';
import { myProvider, ModelId } from '../providers';
import { storeBlob } from '@/lib/blob-storage';
import type { UIMessageStreamWriter } from 'ai';
import type { ChatMessage } from '@/lib/types';

interface GenerateImageProps {
  dataStream: UIMessageStreamWriter<ChatMessage>;
}

export const generateImage = ({ dataStream }: GenerateImageProps) =>
  tool({
    description:
      'Generate images using AI based on text descriptions. This tool can create various types of images including illustrations, photos, artwork, diagrams, and more. Use this when users request image generation, visual content creation, or when you need to create visual representations of concepts.',
    inputSchema: z.object({
      prompt: z
        .string()
        .describe(
          'Detailed description of the image to generate. Be specific about style, composition, colors, objects, and any other visual elements.',
        ),
      style: z
        .enum([
          'realistic',
          'artistic',
          'illustration',
          'diagram',
          'logo',
          'abstract',
          'cartoon',
          'photographic',
        ])
        .optional()
        .default('realistic')
        .describe('Visual style of the generated image'),
      aspectRatio: z
        .enum(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9'])
        .optional()
        .default('1:1')
        .describe('Aspect ratio of the generated image'),
      quality: z
        .enum(['standard', 'high'])
        .optional()
        .default('high')
        .describe('Quality level of the generated image'),
    }),
    execute: async ({ prompt, style, aspectRatio, quality }) => {
      try {
        // Enhance the prompt with style and quality instructions
        const enhancedPrompt = `Create a ${style} image with ${quality} quality and ${aspectRatio} aspect ratio. ${prompt}`;

        // Stream the generation process
        dataStream.write({
          type: 'data-image-generation-start',
          data: { prompt: enhancedPrompt, style, aspectRatio, quality },
          transient: true,
        });

        const result = await generateText({
          model: myProvider.languageModel(
            ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW,
          ),
          providerOptions: {
            google: {
              responseModalities: ['TEXT', 'IMAGE'],
              // Add any additional Gemini-specific options here if needed
            },
          },
          prompt: enhancedPrompt,
        });

        // Get the first image file from the result
        const imageFiles =
          result.files?.filter((f) => f.mediaType?.startsWith('image/')) || [];

        if (imageFiles.length > 0) {
          const imageFile = imageFiles[0];

          // Store image as blob and get reference
          const blobRef = await storeBlob(
            imageFile.uint8Array,
            imageFile.mediaType || 'image/png',
          );

          // Stream the generated image with blob reference
          dataStream.write({
            type: 'data-image-generated',
            data: {
              blobUrl: blobRef.url,
              mediaType: blobRef.mediaType,
              prompt: enhancedPrompt,
              style,
              aspectRatio,
              quality,
            },
            transient: true,
          });

          return {
            success: true,
            message: `Successfully generated a ${style} image with ${aspectRatio} aspect ratio.`,
            imageData: {
              blobUrl: blobRef.url,
              mediaType: blobRef.mediaType,
              prompt: enhancedPrompt,
              style,
              aspectRatio,
              quality,
            },
          };
        } else {
          // No image was generated
          dataStream.write({
            type: 'data-image-generation-error',
            data: { error: 'No image was generated from the prompt' },
            transient: true,
          });

          return {
            success: false,
            message:
              'No image was generated. Please try a different prompt or description.',
            error: 'No image generated',
          };
        }
      } catch (error) {
        console.error('Image generation error:', error);

        dataStream.write({
          type: 'data-image-generation-error',
          data: {
            error:
              error instanceof Error ? error.message : 'Unknown error occurred',
          },
          transient: true,
        });

        return {
          success: false,
          message:
            'Failed to generate image. Please try again with a different prompt.',
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    },
  });
