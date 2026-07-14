'use client';

import { usePathname } from 'next/navigation';
import { Sidebar } from '@/components/ui/sidebar';
import { SidebarNav } from '@/components/dashboard/sidebar-nav';

export function DashboardSidebarGate() {
  const pathname = usePathname();

  if (pathname?.startsWith('/dashboard/teleorientacion')) {
    return null;
  }

  return (
    <Sidebar>
      <SidebarNav />
    </Sidebar>
  );
}
