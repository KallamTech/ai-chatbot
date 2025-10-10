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
    id: ModelId.DEEPSEEK_V3_2,
    name: 'DeepSeek V3.2',
    description: 'DeepSeek advanced reasoning and coding model',
    provider: 'DeepSeek',
  },
  {
    id: ModelId.DEEPSEEK_V3_2_THINKING,
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
    hasReasoning: true,
  },
  {
    id: ModelId.GROK_4,
    name: 'Grok 4',
    description: 'xAI most advanced model',
    provider: 'xAI',
  },
  {
    id: ModelId.GROK_4_FAST_NON_REASONING,
    name: 'Grok 4 Fast Non Reasoning',
    description: 'xAI compact and efficient non reasoning model',
    provider: 'xAI',
    hasReasoning: true,
  },
  {
    id: ModelId.CLAUDE_SONNET_4,
    name: 'Claude Sonnet 4',
    description: 'Anthropic highly capable model with excellent reasoning',
    provider: 'Anthropic',
  },
  {
    id: ModelId.CLAUDE_SONNET_4_5,
    name: 'Claude Sonnet 4.5',
    description: 'Anthropic most advanced model for general tasks',
    provider: 'Anthropic',
  },
  {
    id: ModelId.CLAUDE_SONNET_4_5_REASONING,
    name: 'Claude Sonnet 4.5 Reasoning',
    description: 'Claude Sonnet 4.5 with advanced reasoning capabilities',
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
    id: ModelId.PERPLEXITY_SONAR_PRO,
    name: 'Sonar Pro',
    description: 'Perplexity advanced model with web search capabilities',
    provider: 'Perplexity',
  },
  {
    id: ModelId.PERPLEXITY_SONAR,
    name: 'Sonar',
    description: 'Perplexity model with real-time web search',
    provider: 'Perplexity',
  },
  {
    id: ModelId.PERPLEXITY_SONAR_REASONING,
    name: 'Sonar Reasoning',
    description: 'Perplexity model with web search and reasoning capabilities',
    provider: 'Perplexity',
    hasReasoning: true,
  },
  {
    id: ModelId.LLAMA_3_2_90B,
    name: 'Llama 3.2 90B',
    description: 'Meta advanced large language model with 90B parameters',
    provider: 'Meta',
  },
  {
    id: ModelId.LLAMA_4_SCOUT,
    name: 'Llama 4 Scout',
    description: 'Meta Llama 4 Scout model for exploration and discovery tasks',
    provider: 'Meta',
  },
  {
    id: ModelId.LLAMA_4_MAVERICK,
    name: 'Llama 4 Maverick',
    description:
      'Meta Llama 4 Maverick model for innovative and creative tasks',
    provider: 'Meta',
  },
  {
    id: ModelId.KIMI_K2,
    name: 'Kimi K2',
    description:
      'Moonshot AI advanced language model with enhanced capabilities',
    provider: 'Moonshot AI',
  },
  {
    id: ModelId.PIXTRAL_LARGE,
    name: 'Pixtral Large',
    description: 'Mistral large multimodal model with vision capabilities',
    provider: 'Mistral',
    supportsImages: true,
  },
  {
    id: ModelId.MISTRAL_LARGE,
    name: 'Mistral Large',
    description: 'Mistral advanced large language model',
    provider: 'Mistral',
  },
  {
    id: ModelId.COMMAND_A,
    name: 'Command A',
    description: 'Cohere advanced language model for complex tasks',
    provider: 'Cohere',
  },
  {
    id: ModelId.QWEN_3_235B,
    name: 'Qwen 3 235B',
    description: 'Alibaba advanced large language model with 235B parameters',
    provider: 'Alibaba',
  },
  {
    id: ModelId.QWEN3_CODER,
    name: 'Qwen3 Coder',
    description: 'Alibaba specialized coding model based on Qwen3',
    provider: 'Alibaba',
  },
  {
    id: ModelId.GPT_OSS_120B,
    name: 'GPT OSS 120B',
    description: 'OpenAI open-source model with 120B parameters',
    provider: 'OpenAI',
  },
  {
    id: ModelId.GLM_4_6,
    name: 'GLM 4.6',
    description: 'Zhipu AI advanced language model with enhanced reasoning',
    provider: 'Zhipu AI',
  },
];
