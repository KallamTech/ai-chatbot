import { z } from 'zod';
import { ModelId } from '@/lib/ai/providers';

const textPartSchema = z.object({
  type: z.enum(['text']),
  text: z.string().min(1).max(2000),
});

const filePartSchema = z.object({
  type: z.enum(['file']),
  mediaType: z.enum(['image/jpeg', 'image/png']),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const partSchema = z.union([textPartSchema, filePartSchema]);

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(['user']),
    parts: z.array(partSchema),
  }),
  selectedChatModel: z.enum([
    ModelId.GPT_4_1,
    ModelId.GPT_4_1_MINI,
    ModelId.GPT_5,
    ModelId.O4_MINI,
    ModelId.O4_MINI_REASONING,
    ModelId.GEMINI_2_5_FLASH_LITE,
    ModelId.GEMINI_2_5_FLASH,
    ModelId.DEEPSEEK_V3_1,
    ModelId.DEEPSEEK_V3_1_THINKING,
    ModelId.GROK_CODE_FAST_1,
    ModelId.GROK_3_MINI,
    ModelId.GROK_4,
    ModelId.CLAUDE_SONNET_3_7,
    ModelId.CLAUDE_SONNET_4,
    ModelId.CLAUDE_SONNET_4_REASONING,
    ModelId.GEMINI_2_5_PRO_REASONING,
    ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW,
    ModelId.TITLE_MODEL,
    ModelId.ARTIFACT_MODEL,
    ModelId.CODE_MODEL,
  ]),
  selectedVisibilityType: z.enum(['public', 'private']),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
