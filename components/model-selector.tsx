'use client';

import { useMemo, useState, useRef } from 'react';

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
import { Input } from '@/components/ui/input';
import { chatModels } from '@/lib/ai/models';
import { cn } from '@/lib/utils';

import {
  CheckCircleFillIcon,
  ChevronDownIcon,
  BrainIcon,
  SearchIcon,
} from './icons';
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
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const userType = session.user.type;
  const { availableChatModelIds } = entitlementsByUserType[userType];

  const availableChatModels = chatModels.filter((chatModel) =>
    availableChatModelIds.includes(chatModel.id),
  );

  // Filter models based on search query
  const filteredModels = useMemo(() => {
    return availableChatModels.filter((model) => {
      const matchesSearch =
        searchQuery === '' ||
        model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.provider.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesSearch;
    });
  }, [availableChatModels, searchQuery]);

  // Group filtered models by provider with preferred ordering
  const modelsByProvider = useMemo(() => {
    const groups: Record<string, typeof filteredModels> = {};
    filteredModels.forEach((model) => {
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
  }, [filteredModels]);

  // Order providers for consistent display
  const providerOrder = [
    'OpenAI',
    'Anthropic',
    'Google',
    'DeepSeek',
    'xAI',
    'Perplexity',
    'Meta',
    'Moonshot AI',
    'Mistral',
    'Cohere',
    'Alibaba',
    'Z.AI',
  ];
  const orderedProviders = providerOrder.filter(
    (provider) => modelsByProvider[provider],
  );

  const selectedChatModel = useMemo(() => {
    const found =
      availableChatModels.find(
        (chatModel) => chatModel.id === selectedModelId,
      ) || availableChatModels[0];
    return found;
  }, [selectedModelId, availableChatModels]);

  // Clear search when dropdown closes and focus input when opening
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    if (!newOpen) {
      setSearchQuery('');
    } else {
      // Focus the search input when dropdown opens
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  };

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
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
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
        className="min-w-[350px] max-h-[60vh] overflow-y-auto"
        onCloseAutoFocus={(e) => {
          // Prevent auto-focus when closing
          e.preventDefault();
        }}
      >
        {/* Search Controls */}
        <div className="p-3 border-b">
          {/* Search Input */}
          <div className="relative">
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground">
              <SearchIcon size={16} />
            </div>
            <Input
              ref={searchInputRef}
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Prevent dropdown menu from handling keyboard navigation
                e.stopPropagation();
              }}
              onClick={(e) => {
                // Prevent dropdown from closing when clicking the input
                e.stopPropagation();
              }}
              className="pl-9 h-8"
            />
          </div>
        </div>

        {/* Models List */}
        <div className="max-h-[40vh] overflow-y-auto">
          {orderedProviders.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No models found matching your criteria
            </div>
          ) : (
            orderedProviders.map((provider, providerIndex) => {
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
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
