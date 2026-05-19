// ============================================================
// components/chat/TypingIndicator.tsx — Indicador de "escribiendo..."
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/avatar';

export default function TypingIndicator() {
  return (
    <div className="flex w-full px-4 py-4 md:px-8">
      <div className="flex w-full max-w-5xl gap-4">
        <DraHildaAvatar size="chat" className="mt-1" />
        <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:0ms]" />
            <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:140ms]" />
            <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:280ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}
