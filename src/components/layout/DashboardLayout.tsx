// ============================================================
// components/layout/DashboardLayout.tsx — Layout principal con sidebar
// ============================================================
'use client';

import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleToggle = useCallback(() => setSidebarOpen((v) => !v), []);
  const handleClose = useCallback(() => setSidebarOpen(false), []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Sidebar — siempre visible en lg+, hamburguesa en móvil */}
      <Sidebar isOpen={sidebarOpen} onClose={handleClose} />

      {/* Contenido principal */}
      <main className="flex flex-1 flex-col min-w-0 h-full">
        {children}
      </main>
    </div>
  );
}

// Hook para que los hijos puedan toggle el sidebar
export { DashboardLayout };
