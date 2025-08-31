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
    maxMessagesPerDay: 20,
    availableChatModelIds: [
      ModelId.GPT_4_1_MINI,
      ModelId.O4_MINI,
    ],
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
      ModelId.DEEPSEEK_V3_1,
      ModelId.DEEPSEEK_V3_1_THINKING,
      ModelId.GROK_4,
      ModelId.GROK_3_MINI,
      ModelId.CLAUDE_SONNET_3_7,
      ModelId.CLAUDE_SONNET_4_REASONING,
      ModelId.GEMINI_2_5_FLASH_IMAGE_PREVIEW,
    ],
  },

  /*
   * TODO: For users with an account and a paid membership
   */
};
