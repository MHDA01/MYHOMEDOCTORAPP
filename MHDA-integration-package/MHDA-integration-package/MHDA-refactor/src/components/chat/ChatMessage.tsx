// ============================================================
// components/chat/ChatMessage.tsx — Burbuja de mensaje individual
// ============================================================
'use client';

import DraHildaAvatar from '@/components/ui/Avatar';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatMessageProps {
  message: ChatMessageType;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex items-end gap-3 px-4 py-2 ${
        isUser ? 'flex-row-reverse' : 'flex-row'
      }`}
    >
      {/* Avatar (solo para assistant) */}
      {!isUser && <DraHildaAvatar size="sm" className="mb-1" />}

      {/* Burbuja del mensaje */}
      <div
        className={`relative max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm md:max-w-[70%] ${
          isUser
            ? 'bg-brand-600 text-white rounded-br-md'
            : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
        }`}
      >
        {/* Nombre del remitente */}
        {!isUser && (
          <p className="mb-1 text-xs font-semibold text-brand-700">
            Dra. Hilda
          </p>
        )}

        {/* Contenido del mensaje — soporta saltos de línea */}
        <div className="whitespace-pre-wrap">{message.content}</div>

        {/* Timestamp */}
        <p
          className={`mt-1.5 text-[10px] ${
            isUser ? 'text-white/60 text-right' : 'text-gray-400'
          }`}
        >
          {message.timestamp.toLocaleTimeString('es-CO', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>

      {/* Icono de usuario (para mensajes propios) */}
      {isUser && (
        <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 text-xs font-bold">
          Tú
        </div>
      )}
    </div>
  );
}
