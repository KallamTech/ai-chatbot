import {
  customProvider,
  defaultSettingsMiddleware,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import { isTestEnvironment } from '../constants';
import { gateway } from './gateway';
import type { AnthropicProviderOptions } from '@ai-sdk/anthropic';

// Conditionally import test models only in test environment
let testModels: any = null;
if (isTestEnvironment) {
  try {
    testModels = require('./models.test');
  } catch (e) {
    // Test models not available, fallback to production models
  }
}

export enum ModelId {
  GPT_4_1 = 'openai/gpt-4.1',
  GPT_4_1_MINI = 'openai/gpt-4.1-mini',
  GPT_5 = 'openai/gpt-5',
  O4_MINI = 'openai/o4-mini',
  O4_MINI_REASONING = 'openai/o4-mini-reasoning',
  GEMINI_2_5_FLASH_LITE = 'google/gemini-2.5-flash-lite',
  GEMINI_2_5_FLASH = 'google/gemini-2.5-flash',
  DEEPSEEK_V3_2 = 'deepseek/deepseek-v3.2-exp',
  DEEPSEEK_V3_2_THINKING = 'deepseek/deepseek-v3.2-exp-thinking',
  GROK_CODE_FAST_1 = 'xai/grok-code-fast-1',
  GROK_4_FAST_NON_REASONING = 'xai/grok-4-fast-non-reasoning',
  GROK_4 = 'xai/grok-4',
  CLAUDE_SONNET_4 = 'anthropic/claude-sonnet-4',
  CLAUDE_SONNET_4_5 = 'anthropic/claude-sonnet-4.5',
  CLAUDE_SONNET_4_5_REASONING = 'anthropic/claude-sonnet-4.5-reasoning',
  GEMINI_2_5_PRO_REASONING = 'google/gemini-2.5-pro-reasoning',
  GEMINI_2_5_FLASH_IMAGE_PREVIEW = 'google/gemini-2.5-flash-image-preview',
  PERPLEXITY_SONAR_PRO = 'perplexity/sonar-pro',
  PERPLEXITY_SONAR = 'perplexity/sonar',
  PERPLEXITY_SONAR_REASONING = 'perplexity/sonar-reasoning',
  LLAMA_3_2_90B = 'meta/llama-3.2-90b',
  LLAMA_4_SCOUT = 'meta/llama-4-scout',
  LLAMA_4_MAVERICK = 'meta/llama-4-maverick',
  KIMI_K2 = 'moonshotai/kimi-k2',
  PIXTRAL_LARGE = 'mistral/pixtral-large',
  MISTRAL_LARGE = 'mistral/mistral-large',
  COMMAND_A = 'cohere/command-a',
  QWEN_3_235B = 'alibaba/qwen-3-235b',
  QWEN3_CODER = 'alibaba/qwen3-coder',
  GPT_OSS_120B = 'openai/gpt-oss-120b',
  GLM_4_6 = 'zai/glm-4.6',
  TITLE_MODEL = 'title-model',
  ARTIFACT_MODEL = 'artifact-model',
  CODE_MODEL = 'code-model',
  WEBSEARCH_MODEL = 'websearch-model',
  COHERE_EMBED_V4 = 'cohere/embed-v4.0',
  DEEPRESEARCH_MODEL = 'deepresearch-model',
}

export const myProvider =
  isTestEnvironment && testModels
    ? customProvider({
        languageModels: {
          [ModelId.GPT_4_1]: testModels.chatModel,
          [ModelId.GPT_4_1_MINI]: testModels.chatModel,
          [ModelId.GPT_5]: testModels.chatModel,
          [ModelId.O4_MINI]: testModels.chatModel,
          [ModelId.O4_MINI_REASONING]: testModels.reasoningModel,
          [ModelId.GEMINI_2_5_FLASH_LITE]: testModels.chatModel,
          [ModelId.GEMINI_2_5_FLASH]: testModels.chatModel,
          [ModelId.DEEPSEEK_V3_2]: testModels.chatModel,
          [ModelId.DEEPSEEK_V3_2_THINKING]: testModels.reasoningModel,
          [ModelId.GROK_CODE_FAST_1]: testModels.chatModel,
          [ModelId.GROK_4]: testModels.chatModel,
          [ModelId.GROK_4_FAST_NON_REASONING]: testModels.chatModel,
          [ModelId.CLAUDE_SONNET_4]: testModels.chatModel,
          [ModelId.CLAUDE_SONNET_4_5]: testModels.chatModel,
          [ModelId.CLAUDE_SONNET_4_5_REASONING]: testModels.reasoningModel,
          [ModelId.GEMINI_2_5_PRO_REASONING]: testModels.reasoningModel,
          [ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW]: testModels.chatModel,
          [ModelId.PERPLEXITY_SONAR_PRO]: testModels.chatModel,
          [ModelId.PERPLEXITY_SONAR]: testModels.chatModel,
          [ModelId.PERPLEXITY_SONAR_REASONING]: testModels.reasoningModel,
          // New models
          [ModelId.LLAMA_3_2_90B]: testModels.chatModel,
          [ModelId.LLAMA_4_SCOUT]: testModels.chatModel,
          [ModelId.LLAMA_4_MAVERICK]: testModels.chatModel,
          [ModelId.KIMI_K2]: testModels.chatModel,
          [ModelId.PIXTRAL_LARGE]: testModels.chatModel,
          [ModelId.MISTRAL_LARGE]: testModels.chatModel,
          [ModelId.COMMAND_A]: testModels.chatModel,
          [ModelId.QWEN_3_235B]: testModels.chatModel,
          [ModelId.QWEN3_CODER]: testModels.chatModel,
          [ModelId.GPT_OSS_120B]: testModels.chatModel,
          [ModelId.GLM_4_6]: testModels.chatModel,
          [ModelId.TITLE_MODEL]: testModels.titleModel,
          [ModelId.ARTIFACT_MODEL]: testModels.artifactModel,
          [ModelId.CODE_MODEL]: testModels.artifactModel,
          [ModelId.WEBSEARCH_MODEL]: testModels.chatModel,
          [ModelId.DEEPRESEARCH_MODEL]: testModels.reasoningModel,
        },
        imageModels: {
          // No dedicated image models currently
        },
        textEmbeddingModels: {
          [ModelId.COHERE_EMBED_V4]: testModels?.textEmbeddingModel || null,
        },
      })
    : customProvider({
        languageModels: {
          [ModelId.GPT_4_1]: gateway.languageModel(ModelId.GPT_4_1),
          [ModelId.GPT_4_1_MINI]: gateway.languageModel(ModelId.GPT_4_1_MINI),
          [ModelId.GPT_5]: gateway.languageModel(ModelId.GPT_5),
          [ModelId.O4_MINI]: gateway.languageModel(ModelId.O4_MINI),
          [ModelId.GEMINI_2_5_FLASH_LITE]: gateway.languageModel(
            ModelId.GEMINI_2_5_FLASH_LITE,
          ),
          [ModelId.GEMINI_2_5_FLASH]: gateway.languageModel(
            ModelId.GEMINI_2_5_FLASH,
          ),
          [ModelId.DEEPSEEK_V3_2]: gateway.languageModel(ModelId.DEEPSEEK_V3_2),
          [ModelId.GROK_CODE_FAST_1]: gateway.languageModel(
            ModelId.GROK_CODE_FAST_1,
          ),
          [ModelId.GROK_4]: gateway.languageModel(ModelId.GROK_4),
          [ModelId.GROK_4_FAST_NON_REASONING]: gateway.languageModel(ModelId.GROK_4_FAST_NON_REASONING),
          [ModelId.CLAUDE_SONNET_4]: gateway.languageModel(
            ModelId.CLAUDE_SONNET_4,
          ),
          [ModelId.CLAUDE_SONNET_4_5]: gateway.languageModel(
            ModelId.CLAUDE_SONNET_4_5,
          ),
          [ModelId.LLAMA_3_2_90B]: gateway.languageModel(ModelId.LLAMA_3_2_90B),
          [ModelId.LLAMA_4_SCOUT]: gateway.languageModel(ModelId.LLAMA_4_SCOUT),
          [ModelId.LLAMA_4_MAVERICK]: gateway.languageModel(
            ModelId.LLAMA_4_MAVERICK,
          ),
          [ModelId.KIMI_K2]: gateway.languageModel(ModelId.KIMI_K2),
          [ModelId.PIXTRAL_LARGE]: gateway.languageModel(ModelId.PIXTRAL_LARGE),
          [ModelId.MISTRAL_LARGE]: gateway.languageModel(ModelId.MISTRAL_LARGE),
          [ModelId.COMMAND_A]: gateway.languageModel(ModelId.COMMAND_A),
          [ModelId.QWEN_3_235B]: gateway.languageModel(ModelId.QWEN_3_235B),
          [ModelId.QWEN3_CODER]: gateway.languageModel(ModelId.QWEN3_CODER),
          [ModelId.GPT_OSS_120B]: gateway.languageModel(ModelId.GPT_OSS_120B),
          [ModelId.GLM_4_6]: gateway.languageModel(ModelId.GLM_4_6),
          [ModelId.O4_MINI_REASONING]: wrapLanguageModel({
            model: gateway.languageModel(ModelId.O4_MINI),
            middleware: [
              defaultSettingsMiddleware({
                settings: {
                  providerOptions: {
                    azure: {
                      reasoningEffort: 'high',
                      reasoningSummary: 'detailed',
                    },
                  },
                },
              }),
              extractReasoningMiddleware({ tagName: 'think' }),
            ],
          }),
          [ModelId.DEEPSEEK_V3_2_THINKING]: wrapLanguageModel({
            model: gateway.languageModel(ModelId.DEEPSEEK_V3_2_THINKING),
            middleware: [extractReasoningMiddleware({ tagName: 'think' })],
          }),

          [ModelId.CLAUDE_SONNET_4_5_REASONING]: wrapLanguageModel({
            model: gateway.languageModel(ModelId.CLAUDE_SONNET_4_5),
            middleware: [
              defaultSettingsMiddleware({
                settings: {
                  providerOptions: {
                    gateway: {
                      only: ['vertex', 'anthropic'],
                    },
                    anthropic: {
                      thinking: {
                        type: 'enabled',
                        budgetTokens: 12000,
                      },
                    } satisfies AnthropicProviderOptions,
                  },
                },
              }),
              extractReasoningMiddleware({ tagName: 'think' }),
            ],
          }),
          [ModelId.GEMINI_2_5_PRO_REASONING]: wrapLanguageModel({
            model: gateway.languageModel('google/gemini-2.5-pro'),
            middleware: defaultSettingsMiddleware({
              settings: {
                providerOptions: {
                  gateway: {
                    order: ['vertex'],
                  },
                  google: {
                    // Options are nested under 'google' for Vertex provider
                    thinkingConfig: {
                      includeThoughts: true,
                      thinkingBudget: 12000, // Optional
                    },
                  },
                },
              },
            }),
          }),
          [ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW]: gateway.languageModel(
            ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW,
          ),
          [ModelId.PERPLEXITY_SONAR_PRO]: gateway.languageModel(
            ModelId.PERPLEXITY_SONAR_PRO,
          ),
          [ModelId.PERPLEXITY_SONAR]: gateway.languageModel(
            ModelId.PERPLEXITY_SONAR,
          ),
          [ModelId.PERPLEXITY_SONAR_REASONING]: wrapLanguageModel({
            model: gateway.languageModel(ModelId.PERPLEXITY_SONAR_REASONING),
            middleware: [extractReasoningMiddleware({ tagName: 'think' })],
          }),
          [ModelId.TITLE_MODEL]: gateway.languageModel(ModelId.GPT_4_1_MINI),
          [ModelId.ARTIFACT_MODEL]: gateway.languageModel(ModelId.GPT_4_1),
          [ModelId.CODE_MODEL]: gateway.languageModel(ModelId.GROK_CODE_FAST_1),
          [ModelId.WEBSEARCH_MODEL]: gateway.languageModel(
            ModelId.PERPLEXITY_SONAR,
          ),
          [ModelId.DEEPRESEARCH_MODEL]: gateway.languageModel(
            ModelId.PERPLEXITY_SONAR_REASONING,
          ),
        },
        imageModels: {
          // No dedicated image models currently
        },
        textEmbeddingModels: {
          [ModelId.COHERE_EMBED_V4]: gateway.textEmbeddingModel(
            ModelId.COHERE_EMBED_V4,
          ),
        },
      });
