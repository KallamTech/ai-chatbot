'use client';

import { useMemo, useState } from 'react';

import { saveChatModelAsCookie } from '@/app/(chat)/actions';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { chatModels } from '@/lib/ai/models';
import { cn } from '@/lib/utils';

import { CheckCircleFillIcon, ChevronDownIcon, BrainIcon } from './icons';
import { entitlementsByUserType } from '@/lib/ai/entitlements';
import type { Session } from 'next-auth';

export function ModelSelector({
  session,
  selectedModelId,
  onModelChange,
  className,
}: {
  session: Session;
  selectedModelId: string;
  onModelChange: (modelId: string) => void;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);

  const userType = session.user.type;
  const { availableChatModelIds } = entitlementsByUserType[userType];

  const availableChatModels = chatModels.filter((chatModel) =>
    availableChatModelIds.includes(chatModel.id),
  );

  // Group models by provider with preferred ordering
  const modelsByProvider = useMemo(() => {
    const groups: Record<string, typeof availableChatModels> = {};
    availableChatModels.forEach((model) => {
      if (!groups[model.provider]) {
        groups[model.provider] = [];
      }
      groups[model.provider].push(model);
    });

    // Sort models within each provider group by name
    Object.keys(groups).forEach((provider) => {
      groups[provider].sort((a, b) => a.name.localeCompare(b.name));
    });

    return groups;
  }, [availableChatModels]);

  // Order providers for consistent display
  const providerOrder = [
    'OpenAI',
    'Anthropic',
    'Google',
    'DeepSeek',
    'xAI',
    'Perplexity',
  ];
  const orderedProviders = providerOrder.filter(
    (provider) => modelsByProvider[provider],
  );

  const selectedChatModel = useMemo(
    () => {
      const found = availableChatModels.find(
        (chatModel) => chatModel.id === selectedModelId,
      ) || availableChatModels[0];
      return found;
    },
    [selectedModelId, availableChatModels],
  );

  const handleModelSelect = async (id: string) => {
    console.log('🚀 ModelSelector: Selecting model:', id);
    setOpen(false);

    // Update the parent component immediately
    onModelChange(id);

    // Save to cookie
    try {
      await saveChatModelAsCookie(id);
      console.log('🚀 ModelSelector: Cookie saved successfully');
    } catch (error) {
      console.error('🚀 ModelSelector: Failed to save cookie:', error);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className={cn(
          'w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground',
          className,
        )}
      >
        <Button
          data-testid="model-selector"
          variant="outline"
          className="md:px-2 md:h-[34px]"
        >
          <div className="flex items-center gap-2">
            <span>{selectedChatModel?.name}</span>
            {selectedChatModel?.hasReasoning && (
              <BrainIcon
                size={12}
                className="text-purple-500 dark:text-purple-400"
              />
            )}
          </div>
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[300px] max-h-[60vh] overflow-y-auto"
      >
        {orderedProviders.map((provider, providerIndex) => {
          const models = modelsByProvider[provider];
          return (
            <div key={provider}>
              {providerIndex > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {provider}
              </DropdownMenuLabel>
              {models.map((chatModel) => {
                const { id } = chatModel;

                return (
                  <DropdownMenuItem
                    data-testid={`model-selector-item-${id}`}
                    key={id}
                    onSelect={() => {
                      handleModelSelect(id);
                    }}
                    data-active={id === selectedModelId}
                    className="gap-4 group/item flex flex-row justify-between items-center w-full"
                  >
                      <div className="flex flex-col gap-1 items-start">
                        <div className="flex items-center gap-2">
                          <span>{chatModel.name}</span>
                          {chatModel.hasReasoning && (
                            <BrainIcon
                              size={12}
                              className="text-purple-500 dark:text-purple-400"
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {chatModel.description}
                        </div>
                      </div>

                      <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
                        <CheckCircleFillIcon />
                      </div>
                  </DropdownMenuItem>
                );
              })}
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
