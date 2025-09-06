import { z } from 'zod';
import { ModelId } from '@/lib/ai/providers';

// Base text part schema for unauthenticated users (shorter limit)
const textPartSchemaGuest = z.object({
  type: z.enum(['text']),
  text: z.string().min(1).max(2000),
});

// Extended text part schema for authenticated users (longer limit)
const textPartSchemaAuthenticated = z.object({
  type: z.enum(['text']),
  text: z.string().min(1).max(100000),
});

const filePartSchema = z.object({
  type: z.enum(['file']),
  mediaType: z.enum(['image/jpeg', 'image/png']),
  name: z.string().min(1).max(100),
  url: z.string().url(),
});

const partSchemaGuest = z.union([textPartSchemaGuest, filePartSchema]);
const partSchemaAuthenticated = z.union([textPartSchemaAuthenticated, filePartSchema]);

// Schema for unauthenticated users (guests)
export const postRequestBodySchemaGuest = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(['user']),
    parts: z.array(partSchemaGuest),
  }),
  selectedChatModel: z.enum([
    ModelId.GPT_4_1_MINI,
    ModelId.O4_MINI,
  ]),
  selectedVisibilityType: z.enum(['public', 'private']),
});

// Schema for authenticated users
export const postRequestBodySchemaAuthenticated = z.object({
  id: z.string().uuid(),
  message: z.object({
    id: z.string().uuid(),
    role: z.enum(['user']),
    parts: z.array(partSchemaAuthenticated),
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
    ModelId.LLAMA_3_2_90B,
    ModelId.LLAMA_4_SCOUT,
    ModelId.LLAMA_4_MAVERICK,
    ModelId.KIMI_K2,
    ModelId.PIXTRAL_LARGE,
    ModelId.MISTRAL_LARGE,
    ModelId.COMMAND_A,
    ModelId.QWEN_3_235B,
    ModelId.QWEN3_CODER,
    ModelId.GPT_OSS_120B,
    ModelId.GLM_4_5,
  ]),
  selectedVisibilityType: z.enum(['public', 'private']),
});

// Union type for both schemas
export const postRequestBodySchema = z.union([
  postRequestBodySchemaGuest,
  postRequestBodySchemaAuthenticated,
]);

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
export type PostRequestBodyGuest = z.infer<typeof postRequestBodySchemaGuest>;
export type PostRequestBodyAuthenticated = z.infer<typeof postRequestBodySchemaAuthenticated>;
