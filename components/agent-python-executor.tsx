'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PlayIcon, LoaderIcon, CheckCircleFillIcon, CrossIcon } from '@/components/icons';
import { cn } from '@/lib/utils';

interface AgentPythonExecutorProps {
  code: string;
  description?: string;
}

interface ExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  result?: string;
}

export function AgentPythonExecutor({ code, description }: AgentPythonExecutorProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const pyodideRef = useRef<any>(null);

  const loadPyodide = async () => {
    if (pyodideRef.current) return pyodideRef.current;

    // @ts-expect-error - loadPyodide is not defined
    const pyodide = await globalThis.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.23.4/full/',
    });

    pyodideRef.current = pyodide;
    return pyodide;
  };

  const handleExecute = async () => {
    if (!code.trim()) return;

    setIsExecuting(true);
    setExecutionResult(null);

    try {
      const pyodide = await loadPyodide();
      const outputContent: string[] = [];

      // Set up output capture
      pyodide.setStdout({
        batched: (output: string) => {
          outputContent.push(output);
        },
      });

      // Load required packages
      await pyodide.loadPackagesFromImports(code);

      // Execute the code
      const result = await pyodide.runPythonAsync(code);

      setExecutionResult({
        success: true,
        output: outputContent.join(''),
        result: result !== undefined ? String(result) : undefined,
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
              Python Executor
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
            {executionResult.success && executionResult.result && (
              <div className="mt-2">
                <h5 className="text-sm font-medium mb-1">Return Value:</h5>
                <div className="bg-blue-50 border border-blue-200 p-2 rounded text-sm">
                  <code>{executionResult.result}</code>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Note */}
        <div className="text-xs text-muted-foreground">
          This Python executor runs code in the browser using Pyodide.
        </div>
      </CardContent>
    </Card>
  );
}
