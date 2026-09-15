'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { BrandLockup } from '@/components/brand-lockup';

/**
 * Encabezado de las pantallas del panel con la disposición del Inicio: en celular,
 * logo y menú arriba; luego el título grande y una línea de contexto.
 */
export function EncabezadoPantalla({ titulo, descripcion }: { titulo: string; descripcion?: string }) {
  return (
    <>
      <div className="flex h-[76px] items-center justify-between md:hidden">
        <BrandLockup />
        <SidebarTrigger className="h-10 w-10 text-brand-900 [&_svg]:size-5" />
      </div>
      <section className="pt-3 md:pt-0">
        <h1 className="text-[26px] font-extrabold text-brand-900 md:text-[32px]">{titulo}</h1>
        {descripcion && <p className="mt-1 text-[15px] text-muted-foreground">{descripcion}</p>}
      </section>
    </>
  );
}
