// ============================================================
// app/dashboard/teleorientacion/page.tsx — Página de Teleorientación
// NOTA: Esta página conecta con tu server action existente.
// Ajusta el import de teleorientacion según tu ruta actual.
// ============================================================
'use client';

import { useState, useCallback } from 'react';
import DashboardLayout from '@/components/layout/DashboardLayout';
import Sidebar from '@/components/layout/Sidebar';
import ChatInterface from '@/components/chat/ChatInterface';
import type { ChatMessage } from '@/types/chat';

// ─── IMPORTANTE ─────────────────────────────────────────────
// Descomenta y ajusta este import para conectar con tu backend:
// import { sendTeleorientacionMessage } from '@/app/actions/teleorientacion';
// ─────────────────────────────────────────────────────────────

export default function TeleorientacionPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Datos de ejemplo — reemplazar con datos reales de Firebase/Auth
  const memberName = 'ALEXANDER';
  const memberAge = 41;
  const memberSex = 'Masculino';

  const handleSendMessage = useCallback(
    async (content: string) => {
      // Agregar mensaje del usuario
      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);

      try {
        // ─── CONEXIÓN CON TU BACKEND EXISTENTE ──────────────
        // Opción 1: Server Action (recomendado)
        // const response = await sendTeleorientacionMessage({
        //   message: content,
        //   memberId: 'current-member-id',
        //   sessionId: 'current-session-id',
        // });

        // Opción 2: API Route
        // const response = await fetch('/api/teleorientacion', {
        //   method: 'POST',
        //   headers: { 'Content-Type': 'application/json' },
        //   body: JSON.stringify({ message: content }),
        // });
        // const data = await response.json();

        // ─── PLACEHOLDER — Simula respuesta ─────────────────
        // Elimina este bloque cuando conectes con tu backend real
        await new Promise((r) => setTimeout(r, 1500));
        const assistantResponse = `Hola, ${memberName}. Entiendo tu consulta sobre "${content}". ` +
          `Déjame orientarte al respecto.\n\n` +
          `Recuerda que este es un servicio de orientación y no reemplaza una consulta médica. ` +
          `¿Hay algo más que quieras preguntarme?`;
        // ─── FIN PLACEHOLDER ────────────────────────────────

        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: assistantResponse, // Reemplazar con response.message o data.message
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } catch (error) {
        console.error('Error en teleorientación:', error);
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: 'assistant',
          content:
            '⚠️ No pude conectar con el asistente en este momento. Por favor, intenta de nuevo.',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [memberName]
  );

  const handleNewSession = useCallback(() => {
    setMessages([]);
  }, []);

  const handleMenuToggle = useCallback(() => {
    setSidebarOpen((v) => !v);
  }, []);

  const handleMenuClose = useCallback(() => {
    setSidebarOpen(false);
  }, []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={handleMenuClose} />

      {/* Main chat area */}
      <main className="flex flex-1 flex-col min-w-0 h-full">
        <ChatInterface
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isLoading}
          memberName={memberName}
          memberAge={memberAge}
          memberSex={memberSex}
          onMenuToggle={handleMenuToggle}
          onNewSession={handleNewSession}
          onAllergies={() => console.log('Abrir alergias')}
        />
      </main>
    </div>
  );
}
