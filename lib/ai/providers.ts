import {
  customProvider,
  defaultSettingsMiddleware,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from 'ai';
import {
  artifactModel,
  chatModel,
  reasoningModel,
  titleModel,
  imageModel,
} from './models.test';
import { isTestEnvironment } from '../constants';
import { gateway } from './gateway';
import { AnthropicProviderOptions } from '@ai-sdk/anthropic';

export enum ModelId {
  GPT_4_1 = 'openai/gpt-4.1',
  GPT_4_1_MINI = 'openai/gpt-4.1-mini',
  GPT_5 = 'openai/gpt-5',
  O4_MINI = 'openai/o4-mini',
  O4_MINI_REASONING = 'openai/o4-mini-reasoning',
  GEMINI_2_5_FLASH_LITE = 'google/gemini-2.5-flash-lite',
  GEMINI_2_5_FLASH = 'google/gemini-2.5-flash',
  DEEPSEEK_V3_1 = 'deepseek/deepseek-v3.1',
  DEEPSEEK_V3_1_THINKING = 'deepseek/deepseek-v3.1-thinking',
  GROK_CODE_FAST_1 = 'xai/grok-code-fast-1',
  GROK_3_MINI = 'xai/grok-3-mini',
  GROK_4 = 'xai/grok-4',
  CLAUDE_SONNET_3_7 = 'anthropic/claude-3-5-sonnet-20241022',
  CLAUDE_SONNET_4 = 'anthropic/claude-sonnet-4',
  CLAUDE_SONNET_4_REASONING = 'anthropic/claude-sonnet-4-reasoning',
  GEMINI_2_5_PRO_REASONING = 'google/gemini-2.5-pro-reasoning',
  GEMINI_2_5_FLASH_IMAGE_PREVIEW = 'google/gemini-2.5-flash-image-preview',
  TITLE_MODEL = 'title-model',
  ARTIFACT_MODEL = 'artifact-model',
  CODE_MODEL = 'code-model',
}

export const myProvider = isTestEnvironment
  ? customProvider({
      languageModels: {
        [ModelId.GPT_4_1]: chatModel,
        [ModelId.GPT_4_1_MINI]: chatModel,
        [ModelId.GPT_5]: chatModel,
        [ModelId.O4_MINI]: chatModel,
        [ModelId.O4_MINI_REASONING]: reasoningModel,
        [ModelId.GEMINI_2_5_FLASH_LITE]: chatModel,
        [ModelId.GEMINI_2_5_FLASH]: chatModel,
        [ModelId.DEEPSEEK_V3_1]: chatModel,
        [ModelId.DEEPSEEK_V3_1_THINKING]: reasoningModel,
        [ModelId.GROK_CODE_FAST_1]: chatModel,
        [ModelId.GROK_4]: chatModel,
        [ModelId.GROK_3_MINI]: reasoningModel,
        [ModelId.CLAUDE_SONNET_3_7]: chatModel,
        [ModelId.CLAUDE_SONNET_4]: chatModel,
        [ModelId.CLAUDE_SONNET_4_REASONING]: reasoningModel,
        [ModelId.GEMINI_2_5_PRO_REASONING]: reasoningModel,
        [ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW]: chatModel,
        [ModelId.TITLE_MODEL]: titleModel,
        [ModelId.ARTIFACT_MODEL]: artifactModel,
        [ModelId.CODE_MODEL]: artifactModel,
      },
      imageModels: {
        // No dedicated image models currently
      },
    })
  : customProvider({
      languageModels: {
        [ModelId.GPT_4_1]: gateway.languageModel(ModelId.GPT_4_1),
        [ModelId.GPT_4_1_MINI]: gateway.languageModel(ModelId.GPT_4_1_MINI),
        [ModelId.GPT_5]: gateway.languageModel(ModelId.GPT_5),
        [ModelId.O4_MINI]: gateway.languageModel(ModelId.O4_MINI),
        [ModelId.GEMINI_2_5_FLASH_LITE]: gateway.languageModel(ModelId.GEMINI_2_5_FLASH_LITE),
        [ModelId.GEMINI_2_5_FLASH]: gateway.languageModel(ModelId.GEMINI_2_5_FLASH),
        [ModelId.DEEPSEEK_V3_1]: gateway.languageModel(ModelId.DEEPSEEK_V3_1),
        [ModelId.GROK_CODE_FAST_1]: gateway.languageModel(ModelId.GROK_CODE_FAST_1),
        [ModelId.GROK_4]: gateway.languageModel(ModelId.GROK_4),
        [ModelId.GROK_3_MINI]: gateway.languageModel(ModelId.GROK_3_MINI),
        [ModelId.CLAUDE_SONNET_3_7]: gateway.languageModel(ModelId.CLAUDE_SONNET_3_7),
        [ModelId.CLAUDE_SONNET_4]: gateway.languageModel(ModelId.CLAUDE_SONNET_4),
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
        [ModelId.DEEPSEEK_V3_1_THINKING]: wrapLanguageModel({
          model: gateway.languageModel(ModelId.DEEPSEEK_V3_1_THINKING),
          middleware: [extractReasoningMiddleware({ tagName: 'think' })],
        }),

        [ModelId.CLAUDE_SONNET_4_REASONING]: wrapLanguageModel({
          model: gateway.languageModel(ModelId.CLAUDE_SONNET_4),
          middleware: [defaultSettingsMiddleware({
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
            }),extractReasoningMiddleware({ tagName: 'think' })],
        }),
        [ModelId.GEMINI_2_5_PRO_REASONING]: wrapLanguageModel({
          model: gateway.languageModel('google/gemini-2.5-pro'),
          middleware: defaultSettingsMiddleware({
              settings: {
              providerOptions: {
                  gateway: {
                    order: ["vertex"],
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
        [ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW]: gateway.languageModel(ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW),
        [ModelId.TITLE_MODEL]: gateway.languageModel(ModelId.GPT_4_1_MINI),
        [ModelId.ARTIFACT_MODEL]: gateway.languageModel(ModelId.GPT_4_1),
        [ModelId.CODE_MODEL]: gateway.languageModel(ModelId.GROK_CODE_FAST_1),
      },
      imageModels: {
        // No dedicated image models currently
      },
    });
