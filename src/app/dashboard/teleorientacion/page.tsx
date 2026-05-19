'use client';

import { useCallback, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import { sendOrientacionMessage } from '@/app/actions/teleorientacion';
import type { ChatMessage } from '@/types/chat';

export default function TeleorientacionPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessionId, setSessionId] = useState(`session-${Date.now()}`);

  const memberName = 'ALEXANDER';
  const memberAge = 41;
  const memberSex = 'Masculino';

  const patientContext = useMemo(
    () => ({
      fullName: memberName,
      age: memberAge,
      sex: memberSex,
      allergies: [],
      medications: [],
      pathologicalHistory: '',
      surgicalHistory: '',
      gynecologicalHistory: '',
      lastLabResults: [],
    }),
    [memberAge, memberName, memberSex]
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        const result = await sendOrientacionMessage({
          patientContext,
          userMessage: content,
          conversationHistory: messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            content: message.content,
          })),
          sessionId,
          isFirstVisit: messages.length === 0,
          isOnboardingComplete: false,
        });

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: result.success ? result.response : result.error || 'No fue posible procesar tu solicitud en este momento.',
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Error en teleorientación:', error);
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content: 'No pude conectar con el asistente en este momento. Por favor, intenta de nuevo.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages, patientContext, sessionId]
  );

  const handleNewSession = useCallback(() => {
    setMessages([]);
    setSessionId(`session-${Date.now()}`);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, []);

  const handleMenuClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-[100dvh] w-full overflow-hidden bg-slate-50">
      <Sidebar isOpen={sidebarOpen} onClose={handleMenuClose} />
      <main className="flex min-w-0 flex-1 flex-col">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          memberName={memberName}
          memberAge={memberAge}
          memberSex={memberSex}
          onMenuToggle={handleMenuToggle}
          onNewSession={handleNewSession}
        />
      </main>
    </div>
  );
}
