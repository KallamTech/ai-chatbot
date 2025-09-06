import { ModelId, myProvider } from '@/lib/ai/providers';
import { createDocumentHandler } from '@/lib/artifacts/server';
import { generateText } from 'ai';
import { createDocumentPrompt } from '@/lib/ai/prompts';

export const imageDocumentHandler = createDocumentHandler<'image'>({
  kind: 'image',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';

    const result = await generateText({
      model: myProvider.languageModel(ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW),
      system: createDocumentPrompt(title, 'image'),
      providerOptions: {
        google: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      prompt: title,
    });

    // Get the first image file from the result
    const imageFiles =
      result.files?.filter((f) => f.mediaType?.startsWith('image/')) || [];

    if (imageFiles.length > 0) {
      const imageFile = imageFiles[0];
      // Convert uint8Array to base64
      const base64 = Buffer.from(imageFile.uint8Array).toString('base64');
      draftContent = base64;

      dataStream.write({
        type: 'data-imageDelta',
        data: base64,
        transient: true,
      });
    }

    return draftContent;
  },
  onUpdateDocument: async ({ description, dataStream }) => {
    let draftContent = '';

    const result = await generateText({
      model: myProvider.languageModel(ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW),
      providerOptions: {
        google: { responseModalities: ['TEXT', 'IMAGE'] },
      },
      prompt: description,
    });

    // Get the first image file from the result
    const imageFiles =
      result.files?.filter((f) => f.mediaType?.startsWith('image/')) || [];

    if (imageFiles.length > 0) {
      const imageFile = imageFiles[0];
      // Convert uint8Array to base64
      const base64 = Buffer.from(imageFile.uint8Array).toString('base64');
      draftContent = base64;

      dataStream.write({
        type: 'data-imageDelta',
        data: base64,
        transient: true,
      });
    }

    return draftContent;
  },
});
