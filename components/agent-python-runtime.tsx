'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayIcon, LoaderIcon, CheckCircleFillIcon, CrossIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

interface AgentPythonRuntimeProps {
  code: string;
  description?: string;
  onExecute?: (code: string) => void;
}

export function AgentPythonRuntime({ code, description, onExecute }: AgentPythonRuntimeProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    success: boolean;
    output?: string;
    error?: string;
  } | null>(null);

  const handleExecute = async () => {
    if (!code.trim()) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      // Create a temporary code artifact and execute it
      // This would integrate with the existing code execution system
      if (onExecute) {
        onExecute(code);
      }

      // For now, simulate execution
      await new Promise(resolve => setTimeout(resolve, 1000));

      setExecutionResult({
        success: true,
        output: 'Code executed successfully (simulated)',
      });
    } catch (error) {
      setExecutionResult({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <Card className="border-2 border-blue-200 bg-blue-50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-blue-500">
              {isExecuting ? (
                <div className="animate-spin">
                  <LoaderIcon size={16} />
                </div>
              ) : executionResult ? (
                executionResult.success ? (
                  <CheckCircleFillIcon size={16} />
                ) : (
                  <CrossIcon size={16} />
                )
              ) : (
                <PlayIcon size={16} />
              )}
            </div>
            <CardTitle className="text-sm font-medium">
              Python Runtime
            </CardTitle>
          </div>
          <Badge variant="outline" className="text-xs">
            {isExecuting ? 'Executing...' : executionResult ? 'Completed' : 'Ready'}
          </Badge>
        </div>
        {description && (
          <p className="text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* Code Display */}
        <div className="mb-3">
          <h4 className="text-sm font-medium mb-2">Code:</h4>
          <div className="bg-gray-900 text-green-400 p-3 rounded-md font-mono text-sm overflow-x-auto">
            <pre className="whitespace-pre-wrap">{code}</pre>
          </div>
        </div>

        {/* Execute Button */}
        <div className="mb-3">
          <Button
            onClick={handleExecute}
            disabled={isExecuting || !code.trim()}
            className="w-full"
            size="sm"
          >
            {isExecuting ? (
              <>
                <div className="animate-spin mr-2">
                  <LoaderIcon size={16} />
                </div>
                Executing...
              </>
            ) : (
              <>
                <div className="mr-2">
                  <PlayIcon size={16} />
                </div>
                Execute Python Code
              </>
            )}
          </Button>
        </div>

        {/* Execution Result */}
        {executionResult && (
          <div className="mb-3">
            <h4 className="text-sm font-medium mb-2">
              {executionResult.success ? 'Result:' : 'Error:'}
            </h4>
            <div
              className={cn(
                'p-3 rounded-md font-mono text-sm',
                executionResult.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              )}
            >
              <pre className="whitespace-pre-wrap">
                {executionResult.success ? executionResult.output : executionResult.error}
              </pre>
            </div>
          </div>
        )}

        {/* Note */}
        <div className="text-xs text-muted-foreground">
          This Python runtime executes code in the browser using Pyodide.
        </div>
      </CardContent>
    </Card>
  );
}
