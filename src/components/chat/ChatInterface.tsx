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
import type { ChatMessage as ChatMessageType } from '@/types/chat';

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  memberName?: string;
  memberAge?: number;
  memberSex?: string;
  onMenuToggle: () => void;
  onNewSession?: () => void;
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
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-50">
      <ChatHeader
        memberName={memberName}
        memberAge={memberAge}
        memberSex={memberSex}
        onMenuToggle={onMenuToggle}
        onNewSession={onNewSession}
      />

      <TriageBanner />

      <div className="flex-1 overflow-y-auto pb-2 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center px-6 text-center">
            <div className="max-w-xl">
              <h3 className="mb-2 text-2xl font-semibold text-slate-800">Hola, soy la Dra. Hilda</h3>
              <p className="text-sm leading-7 text-slate-500">
                Estoy lista para orientarte en salud familiar. Cuéntame qué está pasando y te acompaño paso a paso.
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        onSend={onSendMessage}
        disabled={isLoading}
        memberName={memberName}
      />
    </div>
  );
}
