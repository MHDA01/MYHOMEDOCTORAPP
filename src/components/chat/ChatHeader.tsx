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
    <header className="flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-6">
      <button
        onClick={onMenuToggle}
        aria-label="Abrir menú"
        className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 lg:hidden"
      >
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-6 w-6">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-3">
        <DraHildaAvatar size="md" showStatus />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-slate-900">Dra. Hilda</h1>
          <p className="truncate text-xs text-slate-500">
            {memberName ? `Teleorientación para ${memberName}` : 'Asistente médico en línea'}
            {memberAge ? ` · ${memberAge} años` : ''}
            {memberSex ? ` · ${memberSex}` : ''}
          </p>
        </div>
      </div>

      {onNewSession && (
        <button
          onClick={onNewSession}
          className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Nueva sesión
        </button>
      )}
    </header>
  );
}
