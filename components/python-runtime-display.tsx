'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayIcon, CheckCircleFillIcon, CrossIcon, LoaderIcon } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PythonRuntimeDisplayProps {
  executionData: {
    status: 'starting' | 'loading_packages' | 'completed' | 'error';
    description?: string;
    message?: string;
    output?: string;
    result?: string | null;
    error?: string;
  };
}

export function PythonRuntimeDisplay({ executionData }: PythonRuntimeDisplayProps) {
  const [isVisible, setIsVisible] = useState(true);

  const getStatusIcon = () => {
    switch (executionData.status) {
      case 'starting':
        return <div className="text-blue-500 animate-spin"><LoaderIcon size={16} /></div>;
      case 'loading_packages':
        return <div className="text-yellow-500 animate-spin"><LoaderIcon size={16} /></div>;
      case 'completed':
        return <div className="text-green-500"><CheckCircleFillIcon size={16} /></div>;
      case 'error':
        return <div className="text-red-500"><CrossIcon size={16} /></div>;
      default:
        return <div className="text-gray-500"><PlayIcon size={16} /></div>;
    }
  };

  const getStatusColor = () => {
    switch (executionData.status) {
      case 'starting':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'loading_packages':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'completed':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getStatusText = () => {
    switch (executionData.status) {
      case 'starting':
        return 'Starting Python execution...';
      case 'loading_packages':
        return 'Loading packages...';
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
              {executionData.status === 'loading_packages' && executionData.message && (
                <div className="mb-3 p-2 bg-yellow-100 rounded-md">
                  <p className="text-sm text-yellow-800">
                    {executionData.message}
                  </p>
                </div>
              )}

              {/* Output */}
              {executionData.output && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium mb-2">Output:</h4>
                  <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm overflow-x-auto">
                    <pre className="whitespace-pre-wrap">{executionData.output}</pre>
                  </div>
                </div>
              )}

              {/* Result */}
              {executionData.result && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium mb-2">Result:</h4>
                  <div className="bg-blue-50 border border-blue-200 p-3 rounded-md">
                    <code className="text-sm text-blue-800">{executionData.result}</code>
                  </div>
                </div>
              )}

              {/* Error */}
              {executionData.error && (
                <div className="mb-3">
                  <h4 className="text-sm font-medium mb-2 text-red-600">Error:</h4>
                  <div className="bg-red-50 border border-red-200 p-3 rounded-md">
                    <code className="text-sm text-red-800">{executionData.error}</code>
                  </div>
                </div>
              )}

              {/* Close button */}
              <div className="flex justify-end">
                <button
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
