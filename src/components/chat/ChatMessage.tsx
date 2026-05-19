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
    <div className={`group flex w-full px-4 py-4 md:px-8 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex w-full max-w-5xl gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && <DraHildaAvatar size="chat" className="mt-1" />}

        <div
          className={`max-w-[86%] rounded-2xl px-5 py-4 text-[15px] leading-7 transition-colors md:max-w-[72%] ${
            isUser
              ? 'bg-slate-100 text-slate-900 group-hover:bg-slate-200/80'
              : 'border border-slate-200 bg-white text-slate-800 group-hover:bg-slate-50'
          }`}
        >
          {!isUser && <p className="mb-2 text-xs font-semibold tracking-wide text-slate-500">Dra. Hilda</p>}
          <div className="whitespace-pre-wrap">{message.content}</div>
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
