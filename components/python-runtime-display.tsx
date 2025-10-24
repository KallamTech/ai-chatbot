'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlayIcon,
  CheckCircleFillIcon,
  CrossIcon,
  LoaderIcon,
} from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PythonRuntimeDisplayProps {
  executionData: {
    status:
      | 'starting'
      | 'loading_packages'
      | 'completed'
      | 'error'
      | 'waiting_for_execution';
    description?: string;
    message?: string;
    output?: string;
    result?: string | null;
    error?: string;
    waitForExecution?: boolean;
  };
}

export function PythonRuntimeDisplay({
  executionData,
}: PythonRuntimeDisplayProps) {
  const [isVisible, setIsVisible] = useState(true);

  const getStatusIcon = () => {
    switch (executionData.status) {
      case 'starting':
        return (
          <div className="text-blue-500 animate-spin">
            <LoaderIcon size={16} />
          </div>
        );
      case 'loading_packages':
        return (
          <div className="text-yellow-500 animate-spin">
            <LoaderIcon size={16} />
          </div>
        );
      case 'waiting_for_execution':
        return (
          <div className="text-orange-500">
            <PlayIcon size={16} />
          </div>
        );
      case 'completed':
        return (
          <div className="text-green-500">
            <CheckCircleFillIcon size={16} />
          </div>
        );
      case 'error':
        return (
          <div className="text-red-500">
            <CrossIcon size={16} />
          </div>
        );
      default:
        return (
          <div className="text-gray-500">
            <PlayIcon size={16} />
          </div>
        );
    }
  };

  const getStatusColor = () => {
    switch (executionData.status) {
      case 'starting':
        return 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-200';
      case 'loading_packages':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-950 dark:border-yellow-800 dark:text-yellow-200';
      case 'waiting_for_execution':
        return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950 dark:border-orange-800 dark:text-orange-200';
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-800 dark:text-green-200';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800 dark:bg-gray-950 dark:border-gray-800 dark:text-gray-200';
    }
  };

  const getStatusText = () => {
    switch (executionData.status) {
      case 'starting':
        return 'Starting Python execution...';
      case 'loading_packages':
        return 'Loading packages...';
      case 'waiting_for_execution':
        return 'Waiting for execution...';
      case 'completed':
        return 'Execution completed';
      case 'error':
        return 'Execution failed';
      default:
        return 'Ready to execute';
    }
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="mb-4"
        >
          <Card className={cn('border-2', getStatusColor())}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <CardTitle className="text-sm font-medium">
                    Python Runtime
                  </CardTitle>
                </div>
                <Badge variant="outline" className="text-xs">
                  {getStatusText()}
                </Badge>
              </div>
              {executionData.description && (
                <p className="text-sm text-muted-foreground">
                  {executionData.description}
                </p>
              )}
            </CardHeader>

            <CardContent className="pt-0">
              {/* Loading packages message */}
              {executionData.status === 'loading_packages' &&
                executionData.message && (
                  <div className="mb-3 p-2 bg-yellow-100 dark:bg-yellow-950 rounded-md">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                      {executionData.message}
                    </p>
                  </div>
                )}

              {/* Waiting for execution message */}
              {executionData.status === 'waiting_for_execution' && (
                <div className="mb-3 p-3 bg-orange-100 dark:bg-orange-950 rounded-md border border-orange-200 dark:border-orange-800">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="text-orange-600 dark:text-orange-400">
                      ⏳
                    </div>
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                      Agent is waiting for you to execute the code
                    </p>
                  </div>
                  <p className="text-sm text-orange-700 dark:text-orange-300">
                    Please click the &quot;Run&quot; button below to execute the
                    Python code. The agent will continue after seeing the
                    results.
                  </p>
                </div>
              )}

              {/* Output */}
              {executionData.output && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium mb-2">Output:</h4>
                  <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm overflow-x-auto">
                    <pre className="whitespace-pre-wrap">
                      {executionData.output}
                    </pre>
                  </div>
                </div>
              )}

              {/* Result */}
              {executionData.result && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium mb-2">Result:</h4>
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-3 rounded-md">
                    <code className="text-sm text-blue-800 dark:text-blue-200">
                      {executionData.result}
                    </code>
                  </div>
                </div>
              )}

              {/* Error */}
              {executionData.error && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium mb-2 text-red-600 dark:text-red-400">
                    Error:
                  </h4>
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 rounded-md">
                    <code className="text-sm text-red-800 dark:text-red-200">
                      {executionData.error}
                    </code>
                  </div>
                </div>
              )}

              {/* Close button */}
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsVisible(false)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
