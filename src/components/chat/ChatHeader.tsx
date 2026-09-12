// ============================================================
// components/chat/ChatHeader.tsx — Cabecera del chat con avatar y controles
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/avatar';

interface ChatHeaderProps {
  memberName?: string;
  memberAge?: number;
  memberSex?: string;
  onMenuToggle: () => void;
  onNewSession?: () => void;
}

export default function ChatHeader({
  memberName,
  memberAge,
  memberSex,
  onMenuToggle,
  onNewSession,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-white/95 px-4 py-2 backdrop-blur md:px-6">
      <button
        onClick={onMenuToggle}
        aria-label="Abrir menú"
        className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sky-100 hover:text-foreground lg:hidden"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-5 w-5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
        <DraHildaAvatar size="sm" showStatus />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-foreground md:text-lg">Dra. Hilda AI</h1>
          <p className="truncate text-[11px] text-muted-foreground sm:text-xs">
            {memberName ? `Teleorientación para ${memberName}` : 'Asistente médico en línea'}
            {memberAge ? ` · ${memberAge} años` : ''}
            {memberSex ? ` · ${memberSex}` : ''}
          </p>
        </div>
      </div>

      {onNewSession && (
        <button
          onClick={onNewSession}
          className="rounded-xl border border-border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-sky-50"
        >
          Nueva sesión
        </button>
      )}
    </header>
  );
}
