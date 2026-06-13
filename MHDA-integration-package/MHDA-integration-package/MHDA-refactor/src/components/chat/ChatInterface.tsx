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
  /** Mensajes de la conversación */
  messages: ChatMessageType[];
  /** Callback al enviar un mensaje */
  onSendMessage: (message: string) => void;
  /** Si está esperando respuesta del backend */
  isLoading?: boolean;
  /** Datos del miembro familiar actual */
  memberName?: string;
  memberAge?: number;
  memberSex?: string;
  /** Callbacks de navegación */
  onMenuToggle: () => void;
  onNewSession?: () => void;
  onAllergies?: () => void;
  onBack?: () => void;
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
  onAllergies,
  onBack,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-gray-50 to-white">
      {/* Header fijo */}
      <ChatHeader
        memberName={memberName}
        memberAge={memberAge}
        memberSex={memberSex}
        onMenuToggle={onMenuToggle}
        onNewSession={onNewSession}
        onAllergies={onAllergies}
        onBack={onBack}
      />

      {/* Banner de triage */}
      <TriageBanner />

      {/* Área de mensajes con scroll */}
      <div className="flex-1 overflow-y-auto px-0 py-4 space-y-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <div className="mb-4 rounded-full bg-brand-50 p-4">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-8 w-8 text-brand-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-700 mb-1">
              ¡Hola! Soy la Dra. Hilda 💚
            </h3>
            <p className="text-sm text-gray-500 max-w-sm">
              Estoy aquí para orientarte sobre tu salud y la de tu familia.
              Cuéntame, ¿en qué puedo ayudarte hoy?
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {isLoading && <TypingIndicator />}

        <div ref={messagesEndRef} />
      </div>

      {/* Input fijo en la parte inferior */}
      <ChatInput
        onSend={onSendMessage}
        disabled={isLoading}
        memberName={memberName}
      />
    </div>
  );
}
