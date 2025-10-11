import type { UserType } from '@/app/(auth)/auth';
import type { ChatModel } from './models';
import { ModelId } from './providers';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  /*
   * For users without an account
   */
  guest: {
    maxMessagesPerDay: 5,
    availableChatModelIds: [ModelId.GPT_4_1_MINI, ModelId.O4_MINI],
  },

  /*
   * For users with an account
   */
  regular: {
    maxMessagesPerDay: 100,
    availableChatModelIds: [
      ModelId.GPT_4_1,
      ModelId.GPT_4_1_MINI,
      ModelId.O4_MINI_REASONING,
      ModelId.GPT_5,
      ModelId.GEMINI_2_5_FLASH_LITE,
      ModelId.GEMINI_2_5_FLASH,
      ModelId.GEMINI_2_5_PRO_REASONING,
      ModelId.DEEPSEEK_V3_2,
      ModelId.DEEPSEEK_V3_2_THINKING,
      ModelId.GROK_CODE_FAST_1,
      ModelId.GROK_4,
      ModelId.GROK_4_FAST_NON_REASONING,
      ModelId.CLAUDE_SONNET_4,
      ModelId.CLAUDE_SONNET_4_5,
      ModelId.CLAUDE_SONNET_4_5_REASONING,
      ModelId.PERPLEXITY_SONAR_PRO,
      ModelId.PERPLEXITY_SONAR,
      ModelId.PERPLEXITY_SONAR_REASONING,
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
      ModelId.GLM_4_6,
    ],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
