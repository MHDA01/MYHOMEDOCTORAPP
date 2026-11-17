// ============================================================
// components/chat/ChatInterface.tsx — Componente principal del chat
// Interfaz tipo LLM moderno (ChatGPT/Claude-like)
// ============================================================
'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Mic } from 'lucide-react';
import ChatHeader from './ChatHeader';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import TriageBanner from './TriageBanner';
import TypingIndicator from './TypingIndicator';
import CierreOrientacion from './CierreOrientacion';
import DraHildaAvatar from '@/components/ui/avatar';
import type { ChatMessage as ChatMessageType } from '@/types/chat';
import type { DatosInformeOrientacion } from '@/lib/informe-orientacion-pdf';
import { alarmaEnLaConversacion } from '@/lib/senal-de-alarma';

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  /** false = no salió. Un texto es la respuesta de Hilda (lo usa el modo de voz). */
  onSendMessage: (message: string, images?: File[]) => void | Promise<string | boolean | void>;
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
  /** Cuando la consulta terminó: datos para armar el informe que se lleva al médico. */
  informe?: DatosInformeOrientacion | null;
  /** Abre el modo conversación. Si no se pasa, el chat queda solo por escrito. */
  onHablar?: () => void;
  /**
   * El grafo disparó una alarma determinista en el servidor
   * (`grafo-del-turno.ts`). Es una puerta MÁS para encender el botón de
   * urgencias, no la única: se suma al detector de frases, nunca lo reemplaza.
   */
  alarmaDelGrafo?: boolean;
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
  informe = null,
  onHablar,
  alarmaDelGrafo = false,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Enciende el botón de urgencias de la cabecera cuando Hilda ya escaló en esta
  // conversación. Se mira aquí porque es donde están los mensajes, y una vez
  // encendido no se apaga: la misma regla de `nivelFinal()`, un nivel no baja.
  //
  // Dos puertas, y la segunda SUMA. El detector de frases mira lo que Hilda
  // respondió; la alarma del grafo es determinista y viene del servidor. Que
  // basten dos "o" es la misma asimetría de `senal-de-alarma.ts`: encenderlo de
  // más cuesta un botón rojo que nadie usó, y no encenderlo deja el camino
  // discreto justo cuando hace falta.
  const alarmaActiva = useMemo(
    () => alarmaDelGrafo || alarmaEnLaConversacion(messages),
    [alarmaDelGrafo, messages]
  );

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
        alarmaActiva={alarmaActiva}
      />

      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        {/* Columna de lectura: ~70 caracteres por línea en computador */}
        <div className="mx-auto flex w-full max-w-3xl flex-col px-3 pb-4 pt-4 sm:px-6">
          {/* El aviso de triage abre cada conversación, en vez de ocupar una franja fija */}
          <TriageBanner />

          {messages.length === 0 && (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <DraHildaAvatar size="xl" />
              <h3 className="mb-2 mt-4 text-2xl font-bold">Hola, soy Hilda</h3>
              <p className="max-w-md text-[15px] leading-7 text-muted-foreground">
                Estoy lista para orientarte en salud familiar. Cuéntame qué está pasando y te acompaño paso a paso.
              </p>
              {onHablar && (
                <button
                  type="button"
                  onClick={onHablar}
                  disabled={disabled}
                  className="mt-5 inline-flex h-14 items-center gap-2 rounded-full bg-primary px-7 text-base font-semibold text-white shadow-soft transition-all hover:bg-teal-600 active:scale-[0.98] disabled:opacity-50"
                >
                  <Mic className="h-5 w-5" />
                  Hablar con Hilda
                </button>
              )}
            </div>
          )}

          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}

          {isLoading && <TypingIndicator />}

          {/* El desenlace de la consulta: el documento que se lleva al médico. */}
          {informe && !isLoading && <CierreOrientacion datos={informe} />}

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

      {/* Una conversación ya empezada también se puede seguir hablando: el
          paciente puede cansarse de escribir a mitad de camino. */}
      {onHablar && messages.length > 0 && (
        <div className="px-3 sm:px-6">
          <button
            type="button"
            onClick={onHablar}
            disabled={isLoading || disabled}
            className="mx-auto flex h-11 items-center gap-2 rounded-full border border-primary/30 bg-sky-50 px-4 text-sm font-semibold text-primary transition-colors hover:bg-sky-100 disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            Seguir hablando con Hilda
          </button>
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
