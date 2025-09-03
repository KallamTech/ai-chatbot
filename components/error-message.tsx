'use client';

import { WarningIcon, RedoIcon } from './icons';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';

interface ErrorMessageProps {
  error?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorMessage({ error, onRetry, className }: ErrorMessageProps) {
  const defaultErrorMessage = "Something went wrong. Please try again.";

  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-4 mx-auto w-full max-w-3xl',
        'bg-red-50 border border-red-200 rounded-lg',
        'text-red-800',
        className
      )}
    >
      <div className="flex items-center gap-2">
        <WarningIcon className="size-5 text-red-600 shrink-0" />
        <h3 className="font-medium text-red-900">Error</h3>
      </div>

      <p className="text-sm text-red-700">
        {error || defaultErrorMessage}
      </p>

      {onRetry && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="gap-2 text-red-700 border-red-300 hover:bg-red-100"
          >
            <RedoIcon className="size-4" />
            Try Again
          </Button>
        </div>
      )}
    </div>
  );
}
