// ============================================================
// components/chat/ChatMessage.tsx — Burbuja de mensaje individual
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/avatar';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div className={`group flex w-full px-4 py-3 sm:py-4 md:px-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex w-full max-w-5xl gap-2 sm:gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && <DraHildaAvatar size="sm" className="mt-1 sm:[&>img]:h-12 sm:[&>img]:w-12" />}

        <div
          className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-6 transition-colors sm:max-w-[90%] sm:px-4 sm:py-3 sm:text-base md:max-w-[75%] md:px-5 md:py-4 ${
            isUser
              ? 'bg-slate-100 text-slate-900 group-hover:bg-slate-200/80'
              : 'border border-slate-200 bg-white text-slate-800 group-hover:bg-slate-50'
          }`}
        >
          {!isUser && <p className="mb-1 text-xs font-semibold tracking-wide text-slate-500 sm:mb-2">Dra. Hilda</p>}
          <div className="whitespace-pre-wrap">{message.content}</div>
          {message.imageUrls?.length ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {message.imageUrls.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200">
                  <img src={url} alt="Adjunto clínico" className="h-auto w-full object-cover" />
                </a>
              ))}
            </div>
          ) : null}
          <p className={`mt-2 text-[11px] ${isUser ? 'text-slate-500 text-right' : 'text-slate-400'}`}>
            {message.timestamp.toLocaleTimeString('es-CO', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
