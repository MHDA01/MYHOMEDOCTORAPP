// ============================================================
// components/chat/ChatInterface.tsx — Componente principal del chat
// Interfaz tipo LLM moderno (ChatGPT/Claude-like)
// ============================================================
'use client';

import { useRef, useEffect } from 'react';
import ChatHeader from './ChatHeader';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TriageBanner from './TriageBanner';
import TypingIndicator from './TypingIndicator';
import DraHildaAvatar from '@/components/ui/avatar';
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string, images?: File[]) => void;
  isLoading?: boolean;
  memberName?: string;
  memberAge?: number;
  memberSex?: string;
  onMenuToggle: () => void;
  onNewSession?: () => void;
  onBuyTokens?: () => void;
  tokensAvailable?: number | null;
  /** Aviso cuando el chat está bloqueado (sin tokens, período vencido...). */
  notice?: string | null;
  disabled?: boolean;
}

export default function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  memberName,
  memberAge,
  memberSex,
  onMenuToggle,
  onNewSession,
  onBuyTokens,
  tokensAvailable = null,
  notice = null,
  disabled = false,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <ChatHeader
        memberName={memberName}
        memberAge={memberAge}
        memberSex={memberSex}
        onMenuToggle={onMenuToggle}
        onNewSession={onNewSession}
        onBuyTokens={onBuyTokens}
        tokensAvailable={tokensAvailable}
      />

      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        {/* Columna de lectura: ~70 caracteres por línea en computador */}
        <div className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-4 pt-4 sm:px-6">
          {/* El aviso de triage abre cada conversación, en vez de ocupar una franja fija */}
          <TriageBanner />

          {messages.length === 0 && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <DraHildaAvatar size="xl" />
              <h3 className="mb-2 mt-4 text-2xl font-bold">Hola, soy la Dra. Hilda</h3>
              <p className="max-w-md text-[15px] leading-7 text-muted-foreground">
                Estoy lista para orientarte en salud familiar. Cuéntame qué está pasando y te acompaño paso a paso.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isLoading && <TypingIndicator />}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {notice && (
        <div className="px-3 sm:px-6">
          <p className="mx-auto w-full max-w-3xl rounded-2xl bg-destructive/10 px-4 py-2.5 text-xs font-medium leading-relaxed text-destructive">
            {notice}
          </p>
        </div>
      )}

      <ChatInput
        onSend={onSendMessage}
        disabled={isLoading || disabled}
        memberName={memberName}
      />
    </div>
  );
}
