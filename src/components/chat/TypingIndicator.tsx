// ============================================================
// components/chat/TypingIndicator.tsx — Indicador de "escribiendo..."
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/avatar';

export default function TypingIndicator() {
  return (
    <div className="flex w-full items-start gap-2.5 py-1.5" aria-live="polite" aria-label="La Dra. Hilda está escribiendo">
      <DraHildaAvatar size="sm" className="mt-0.5" />
      <div className="rounded-3xl rounded-tl-lg bg-muted px-4 py-3.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:0ms]" />
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:140ms]" />
          <span className="h-2 w-2 rounded-full bg-primary/60 animate-bounce [animation-delay:280ms]" />
        </div>
      </div>
    </div>
  );
}
