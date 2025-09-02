'use client';

import { useState, useEffect } from 'react';
import { useDataStream } from '@/components/data-stream-provider';

interface PythonRuntimeExecution {
  id: string;
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
  timestamp: number;
}

export function usePythonRuntime() {
  const { dataStream } = useDataStream();
  const [executions, setExecutions] = useState<PythonRuntimeExecution[]>([]);

  useEffect(() => {
    if (!dataStream?.length) return;

    // Get the latest data stream entry
    const latestDelta = dataStream[dataStream.length - 1];

    if (latestDelta?.type === 'data-codeExecution') {
      const executionData = latestDelta.data;

      setExecutions((prev) => {
        // Check if this is an update to an existing execution or a new one
        const existingIndex = prev.findIndex(
          (exec) =>
            exec.status === 'starting' || exec.status === 'loading_packages',
        );

        if (existingIndex >= 0) {
          // Update existing execution
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...executionData,
            timestamp: Date.now(),
          };
          return updated;
        } else {
          // Create new execution
          const newExecution: PythonRuntimeExecution = {
            id: `exec-${Date.now()}`,
            ...executionData,
            timestamp: Date.now(),
          };
          return [...prev, newExecution];
        }
      });
    }
  }, [dataStream]);

  const clearExecutions = () => {
    setExecutions([]);
  };

  return {
    executions,
    clearExecutions,
  };
}
