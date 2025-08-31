import { ModelId } from './providers';

export const DEFAULT_CHAT_MODEL: string = ModelId.GPT_4_1;

export interface ChatModel {
  id: string;
  name: string;
  description: string;
  provider: string;
  supportsImages?: boolean;
  hasReasoning?: boolean;
}

export const chatModels: Array<ChatModel> = [
  {
    id: ModelId.GPT_4_1,
    name: 'GPT-4.1',
    description: 'OpenAI advanced language model',
    provider: 'OpenAI',
  },
  {
    id: ModelId.GPT_4_1_MINI,
    name: 'GPT-4.1 Mini',
    description: 'OpenAI compact and efficient model',
    provider: 'OpenAI',
  },
  {
    id: ModelId.GPT_5,
    name: 'GPT-5',
    description: 'OpenAI most advanced language model',
    provider: 'OpenAI',
  },
  {
    id: ModelId.O4_MINI,
    name: 'O4 Mini',
    description: 'OpenAI compact and efficient model',
    provider: 'OpenAI',
  },
  {
    id: ModelId.O4_MINI_REASONING,
    name: 'O4 Mini Reasoning',
    description: 'O4 Mini with advanced reasoning capabilities',
    provider: 'OpenAI',
    hasReasoning: true,
  },
  {
    id: ModelId.GEMINI_2_5_FLASH_LITE,
    name: 'Gemini 2.5 Flash Lite',
    description: 'Google fast and efficient model',
    provider: 'Google',
  },
  {
    id: ModelId.GEMINI_2_5_FLASH,
    name: 'Gemini 2.5 Flash',
    description: 'Google fast and capable multimodal model',
    provider: 'Google',
  },
  {
    id: ModelId.DEEPSEEK_V3_1,
    name: 'DeepSeek V3.1',
    description: 'DeepSeek advanced reasoning and coding model',
    provider: 'DeepSeek',
  },
  {
    id: ModelId.DEEPSEEK_V3_1_THINKING,
    name: 'DeepSeek V3.1 Thinking',
    description: 'DeepSeek V3.1 with enhanced thinking capabilities',
    provider: 'DeepSeek',
    hasReasoning: true,
  },
  {
    id: ModelId.GROK_CODE_FAST_1,
    name: 'Grok Code Fast',
    description: 'xAI fast coding-optimized model',
    provider: 'xAI',
  },
  {
    id: ModelId.GROK_4,
    name: 'Grok 4',
    description: 'xAI most advanced model',
    provider: 'xAI',
  },
  {
    id: ModelId.GROK_3_MINI,
    name: 'Grok 3 Mini',
    description: 'xAI compact and efficient reasoning model',
    provider: 'xAI',
    hasReasoning: true,
  },
  {
    id: ModelId.CLAUDE_SONNET_3_7,
    name: 'Claude Sonnet 3.7',
    description: 'Anthropic highly capable model with excellent reasoning',
    provider: 'Anthropic',
  },
  {
    id: ModelId.CLAUDE_SONNET_4,
    name: 'Claude Sonnet 4',
    description: 'Anthropic balanced model for general tasks',
    provider: 'Anthropic',
  },
  {
    id: ModelId.CLAUDE_SONNET_4_REASONING,
    name: 'Claude Sonnet 4 Reasoning',
    description: 'Claude Sonnet 4 with advanced reasoning capabilities',
    provider: 'Anthropic',
    hasReasoning: true,
  },
  {
    id: ModelId.GEMINI_2_5_PRO_REASONING,
    name: 'Gemini 2.5 Pro Reasoning',
    description: 'Gemini 2.5 Pro with advanced reasoning capabilities',
    provider: 'Google',
    hasReasoning: true,
  },
  {
    id: ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW,
    name: 'Gemini 2.5 Flash Image',
    description: 'Google model optimized for image understanding',
    provider: 'Google',
    supportsImages: true,
  },
];
