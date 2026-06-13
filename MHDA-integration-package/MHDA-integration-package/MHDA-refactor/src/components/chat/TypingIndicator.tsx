// ============================================================
// components/chat/TypingIndicator.tsx — Indicador de "escribiendo..."
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/Avatar';

export default function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 px-4 py-2">
      <DraHildaAvatar size="sm" className="mb-1" />
      <div className="rounded-2xl rounded-bl-md border border-gray-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:150ms]" />
          <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}
