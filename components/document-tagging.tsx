'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/utils';
import type { DataPool } from '@/lib/db/schema';

interface DocumentTaggingProps {
  onSelect: (documentName: string) => void;
}

export function DocumentTagging({ onSelect }: DocumentTaggingProps) {
  const { data: datapools, error } = useSWR<DataPool[]>('/api/datapools', fetcher);
  const [searchTerm, setSearchTerm] = useState('');

  if (error) return <div>Failed to load documents</div>;
  if (!datapools) return <div>Loading...</div>;

  const filteredDocuments = datapools
    .flatMap((pool) => pool.documents || [])
    .filter((doc) => doc.name.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="absolute bottom-full mb-2 w-full rounded-lg border bg-background shadow-lg">
      <input
        type="text"
        placeholder="Search documents..."
        className="w-full rounded-t-lg border-b bg-transparent p-2"
        onChange={(e) => setSearchTerm(e.target.value)}
      />
      <ul>
        {filteredDocuments.map((doc) => (
          <li
            key={doc.id}
            className="cursor-pointer p-2 hover:bg-muted"
            onClick={() => onSelect(doc.name)}
          >
            {doc.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
