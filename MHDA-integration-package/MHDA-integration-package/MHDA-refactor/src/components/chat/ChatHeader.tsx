// ============================================================
// components/chat/ChatHeader.tsx — Cabecera del chat con avatar y controles
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/Avatar';

interface ChatHeaderProps {
  memberName?: string;
  memberAge?: number;
  memberSex?: string;
  onMenuToggle: () => void;
  onNewSession?: () => void;
  onAllergies?: () => void;
  onBack?: () => void;
}

export default function ChatHeader({
  memberName,
  memberAge,
  memberSex,
  onMenuToggle,
  onNewSession,
  onAllergies,
  onBack,
}: ChatHeaderProps) {
  return (
    <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 shadow-sm">
      {/* Hamburger menu button */}
      <button
        onClick={onMenuToggle}
        aria-label="Abrir menú"
        className="flex h-10 w-10 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors lg:hidden"
      >
        <svg
          xmlns="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Hamburger_icon.svg/250px-Hamburger_icon.svg.png"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
          className="h-6 w-6"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>

      {/* Avatar y nombre */}
      <div className="flex flex-1 items-center gap-3">
        <DraHildaAvatar size="md" showStatus />
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold text-gray-900 truncate">
            Dra. Hilda
          </h1>
          {memberName ? (
            <p className="text-xs text-gray-500 truncate">
              Orientando sobre{' '}
              <span className="font-medium text-brand-600">{memberName}</span>
              {memberAge && ` · ${memberAge} años`}
              {memberSex && ` · ${memberSex}`}
            </p>
          ) : (
            <p className="text-xs text-green-600">En línea</p>
          )}
        </div>
      </div>

      {/* Acciones rápidas */}
      <div className="flex items-center gap-1">
        {onAllergies && (
          <button
            onClick={onAllergies}
            className="flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 
              hover:bg-red-100 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            Alergias
          </button>
        )}
        {onNewSession && (
          <button
            onClick={onNewSession}
            className="flex items-center gap-1.5 rounded-full bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 
              hover:bg-gray-100 transition-colors"
          >
            <svg xmlns="https://upload.wikimedia.org/wikipedia/commons/b/bc/Refresh_icon.png?utm_source=commons.wikimedia.org&utm_campaign=index&utm_content=original" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H4.598a.75.75 0 00-.75.75v3.634a.75.75 0 001.5 0v-2.033l.312.311a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm-11.23-3.424a.75.75 0 00.182-.557 5.5 5.5 0 019.201-2.466l.312.311H11.345a.75.75 0 000 1.5h3.634a.75.75 0 00.75-.75V2.604a.75.75 0 00-1.5 0v2.033l-.312-.311A7 7 0 002.205 7.465a.75.75 0 001.449.39.75.75 0 00.428-.855z" clipRule="evenodd" />
            </svg>
            Nueva sesión
          </button>
        )}
      </div>
    </header>
  );
}
