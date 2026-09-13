'use client';

import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Fecha corta en hora de Bogotá: "13 sep 2026". */
export function fecha(isoTexto: string | null | undefined, conHora = false): string {
  if (!isoTexto) return '—';
  const d = new Date(isoTexto);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(conHora ? { hour: 'numeric', minute: '2-digit' } : {}),
  });
}

/** "hace 3 días", "hoy"... para columnas de actividad. */
export function haceCuanto(isoTexto: string | null | undefined): string {
  if (!isoTexto) return 'Nunca';
  const ms = Date.now() - new Date(isoTexto).getTime();
  const dias = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (dias <= 0) return 'Hoy';
  if (dias === 1) return 'Ayer';
  if (dias < 30) return `Hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return meses === 1 ? 'Hace 1 mes' : `Hace ${meses} meses`;
}

export function numero(n: number | null | undefined): string {
  return typeof n === 'number' ? n.toLocaleString('es-CO') : '—';
}

export function Tarjeta({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn('rounded-2xl border border-border/70 bg-white p-4 shadow-soft sm:p-5', className)}>{children}</section>;
}

export function Cifra({
  icon: Icon,
  titulo,
  valor,
  detalle,
}: {
  icon: LucideIcon;
  titulo: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="flex flex-col rounded-2xl border border-border/70 bg-white p-4 shadow-soft">
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-primary">
          <Icon className="h-4 w-4" />
        </span>
        {titulo}
      </div>
      <p className="mt-2 text-2xl font-extrabold text-brand-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-muted-foreground">{detalle}</p>}
    </div>
  );
}

export type TonoEtiqueta = 'ok' | 'aviso' | 'malo' | 'gris' | 'info';

const TONOS: Record<TonoEtiqueta, string> = {
  ok: 'bg-teal-50 text-teal-800',
  aviso: 'bg-amber-50 text-amber-800',
  malo: 'bg-red-50 text-red-700',
  gris: 'bg-slate-100 text-slate-600',
  info: 'bg-sky-100 text-brand-800',
};

export function Etiqueta({ tono = 'gris', className, children }: { tono?: TonoEtiqueta; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', TONOS[tono], className)}>
      {children}
    </span>
  );
}

export function MensajeError({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{children}</div>;
}
