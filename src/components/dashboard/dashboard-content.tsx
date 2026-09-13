'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * Contenedor del contenido del dashboard.
 *
 * - Hace scroll vertical: antes tenía overflow-hidden y las páginas largas
 *   (cuenta, informes) no se podían desplazar en pantallas bajas.
 * - Deja espacio abajo para la barra inferior del celular, salvo en el chat,
 *   que ocupa la pantalla completa y maneja su propio scroll.
 */
export function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = pathname?.startsWith('/dashboard/teleorientacion');

  return (
    <div
      className={cn(
        'flex min-h-0 flex-1 flex-col',
        isChat ? 'overflow-hidden' : 'overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0'
      )}
    >
      {children}
    </div>
  );
}
