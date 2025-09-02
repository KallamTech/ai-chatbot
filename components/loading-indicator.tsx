'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface LoadingIndicatorProps {
  message?: string;
  variant?: 'dots' | 'pulse' | 'wave';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const LoadingDots = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const dotSizes = {
    sm: 'w-1 h-1',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((index) => (
        <motion.div
          key={index}
          className={cn('bg-muted-foreground rounded-full', dotSizes[size])}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: index * 0.2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

const LoadingPulse = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  return (
    <motion.div
      className={cn('bg-muted-foreground rounded-full', sizes[size])}
      animate={{
        scale: [1, 1.2, 1],
        opacity: [0.5, 1, 0.5],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
};

const LoadingWave = ({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) => {
  const barSizes = {
    sm: 'w-1 h-3',
    md: 'w-1 h-4',
    lg: 'w-1 h-6',
  };

  return (
    <div className="flex items-end gap-1">
      {[0, 1, 2, 3, 4].map((index) => (
        <motion.div
          key={index}
          className={cn('bg-muted-foreground rounded-full', barSizes[size])}
          animate={{
            height: ['25%', '100%', '25%'],
            opacity: [0.5, 1, 0.5],
          }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: index * 0.1,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  );
};

export const LoadingIndicator = ({
  message = 'Loading...',
  variant = 'dots',
  size = 'md',
  className,
}: LoadingIndicatorProps) => {
  const renderLoader = () => {
    switch (variant) {
      case 'pulse':
        return <LoadingPulse size={size} />;
      case 'wave':
        return <LoadingWave size={size} />;
      default:
        return <LoadingDots size={size} />;
    }
  };

  return (
    <motion.div
      className={cn('flex items-center gap-3 text-muted-foreground', className)}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {renderLoader()}
      <motion.span
        className="text-sm"
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {message}
      </motion.span>
    </motion.div>
  );
};

// Contextual loading messages for different scenarios
export const getContextualLoadingMessage = (
  context:
    | 'thinking'
    | 'agent'
    | 'tool'
    | 'search'
    | 'document'
    | 'python'
    | 'general',
): string => {
  const messages = {
    thinking: [
      'Thinking...',
      'Processing your request...',
      'Analyzing the context...',
      'Formulating a response...',
    ],
    agent: [
      'Agent is working...',
      'Executing agent workflow...',
      'Agent is processing...',
      'Running agent tasks...',
    ],
    tool: [
      'Running tool...',
      'Executing function...',
      'Processing tool call...',
      'Tool is working...',
    ],
    search: [
      'Searching...',
      'Looking up information...',
      'Finding relevant data...',
      'Querying sources...',
    ],
    document: [
      'Processing document...',
      'Analyzing content...',
      'Reading document...',
      'Extracting information...',
    ],
    python: [
      'Running Python code...',
      'Executing script...',
      'Processing code...',
      'Computing results...',
    ],
    general: [
      'Loading...',
      'Please wait...',
      'Processing...',
      'Working on it...',
    ],
  };

  const contextMessages = messages[context] || messages.general;
  return contextMessages[Math.floor(Math.random() * contextMessages.length)];
};

// Animated thinking component with rotating messages
export const AnimatedThinking = ({
  context = 'thinking',
  variant = 'dots',
  size = 'md',
  className,
}: {
  context?:
    | 'thinking'
    | 'agent'
    | 'tool'
    | 'search'
    | 'document'
    | 'python'
    | 'general';
  variant?: 'dots' | 'pulse' | 'wave';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) => {
  const [currentMessage, setCurrentMessage] = useState(
    getContextualLoadingMessage(context),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentMessage(getContextualLoadingMessage(context));
    }, 3000);

    return () => clearInterval(interval);
  }, [context]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={currentMessage}
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -5 }}
        transition={{ duration: 0.3 }}
        className={className}
      >
        <LoadingIndicator
          message={currentMessage}
          variant={variant}
          size={size}
        />
      </motion.div>
    </AnimatePresence>
  );
};
