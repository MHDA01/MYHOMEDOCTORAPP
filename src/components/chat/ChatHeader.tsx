// ============================================================
// components/chat/ChatHeader.tsx — Cabecera del chat con avatar y controles
// ============================================================
'use client';

import Link from 'next/link';
import { ChevronLeft, Coins, History, MessageSquarePlus, MoreHorizontal, Siren } from 'lucide-react';
import DraHildaAvatar from '@/components/ui/avatar';
import { LINEA_EMERGENCIAS } from '@/lib/urgencias-colombia';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ChatHeaderProps {
  memberName?: string;
  memberAge?: number;
  memberSex?: string;
  onMenuToggle: () => void;
  onNewSession?: () => void;
  /** Abre el mismo modal de pago que antes abría la franja "Comprar tokens". */
  onBuyTokens?: () => void;
  /** Consultas disponibles (gratis + premium); null mientras carga. */
  tokensAvailable?: number | null;
  /**
   * Hilda ya escaló en esta conversación. Enciende el botón de urgencias: no lo
   * crea. El botón está siempre, porque uno que solo aparece con la alarma es un
   * botón ausente cuando la detección falla. Ver `src/lib/senal-de-alarma.ts`.
   */
  alarmaActiva?: boolean;
}

export default function ChatHeader({
  memberName,
  memberAge,
  memberSex,
  onMenuToggle,
  onNewSession,
  onBuyTokens,
  tokensAvailable = null,
  alarmaActiva = false,
}: ChatHeaderProps) {
  const detalle = [memberName ? `Consulta de ${memberName}` : null, memberAge ? `${memberAge} años` : null, memberSex || null]
    .filter(Boolean)
    .join(' · ');

  return (
    <header className="flex h-16 shrink-0 items-center gap-1.5 border-b border-border/70 bg-white px-2 sm:gap-3 sm:px-4 md:px-6">
      {/* En celular el chat es pantalla completa: se vuelve al Inicio con la flecha, como en el mockup */}
      <Link
        href="/dashboard"
        aria-label="Volver al inicio"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-900 transition-colors hover:bg-sky-50 lg:hidden"
      >
        <ChevronLeft className="h-6 w-6" />
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
        <DraHildaAvatar size="md" showStatus />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-base font-bold leading-tight text-brand-900 md:text-lg">
            <span className="truncate">Hilda</span>
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-teal-700">
              IA
            </span>
          </h1>
          <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />
            <span className="truncate">En línea{detalle ? ` · ${detalle}` : ''}</span>
          </p>
        </div>
      </div>

      {/*
        Urgencias. Está siempre —callado, gris— y la alarma lo enciende; no
        aparece con ella. Lleva a la pantalla de urgencias y NO marca directo
        ni cuando está encendido: un toque accidental en una cabecera llamaría
        a la línea de emergencias, y el 123 queda a un toque de ahí.

        El rótulo y las etiquetas de voz los aprobó Alexander el 18-nov-2026.
      */}
      <Link
        href="/dashboard/urgencias"
        aria-live="polite"
        aria-label={
          alarmaActiva
            ? `Hilda recomienda atención urgente. Ver qué hacer y llamar al ${LINEA_EMERGENCIAS}`
            : `Urgencias y línea ${LINEA_EMERGENCIAS}`
        }
        className={cn(
          'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-bold transition-colors',
          alarmaActiva
            ? 'animate-pulse border-destructive bg-destructive text-destructive-foreground motion-reduce:animate-none'
            : 'border-border bg-white text-muted-foreground hover:border-destructive/50 hover:text-destructive'
        )}
      >
        <Siren className="h-4 w-4 shrink-0" />
        {alarmaActiva && <span>Llamar al {LINEA_EMERGENCIAS}</span>}
      </Link>

      {onBuyTokens && (
        <button
          type="button"
          onClick={onBuyTokens}
          aria-label={tokensAvailable === null ? 'Comprar tokens' : `${tokensAvailable} consultas disponibles. Comprar tokens`}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-white px-3 text-xs font-bold text-brand-900 transition-colors hover:border-primary hover:bg-sky-50"
        >
          <Coins className="h-4 w-4 text-primary" />
          {tokensAvailable === null ? null : <span>{tokensAvailable}</span>}
          <span className="hidden sm:inline">Comprar</span>
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Más opciones"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-900 transition-colors hover:bg-sky-50"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {onNewSession && (
            <DropdownMenuItem onClick={onNewSession}>
              <MessageSquarePlus className="mr-2 h-4 w-4" />
              Nueva conversación
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={onMenuToggle} className="lg:hidden">
            <History className="mr-2 h-4 w-4" />
            Mis conversaciones
          </DropdownMenuItem>
          {onBuyTokens && (
            <DropdownMenuItem onClick={onBuyTokens}>
              <Coins className="mr-2 h-4 w-4" />
              Comprar tokens
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
