'use client';

import { SidebarToggle } from '@/components/sidebar-toggle';

export function PageHeader() {
  return (
    <header className="flex sticky top-0 bg-background py-1.5 items-center px-2 md:px-2 gap-2 mb-4">
      <SidebarToggle />
    </header>
  );
}
