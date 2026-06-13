// ============================================================
// components/chat/ChatInput.tsx — Input de chat con micrófono y envío
// ============================================================
'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  memberName?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder,
  memberName = '',
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const {
    transcript,
    isListening,
    isSupported,
    toggleListening,
    stopListening,
    resetTranscript,
    error: speechError,
  } = useSpeechRecognition();

  // Cuando la transcripción cambia, actualizar el input
  useEffect(() => {
    if (transcript) {
      setText(transcript);
    }
  }, [transcript]);

  // Auto-resize del textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = `${Math.min(ta.scrollHeight, 150)}px`;
    }
  }, [text]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;

    if (isListening) stopListening();
    onSend(trimmed);
    setText('');
    resetTranscript();

    // Re-focus
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const defaultPlaceholder = memberName
    ? `Escribe tu consulta sobre ${memberName}...`
    : 'Escribe tu consulta...';

  return (
    <div className="border-t border-gray-100 bg-white px-4 pb-4 pt-3">
      {/* Error de speech (si hay) */}
      {speechError && (
        <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
          ⚠️ {speechError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || defaultPlaceholder}
            disabled={disabled}
            rows={1}
            className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 pr-12 text-sm text-gray-800 
              placeholder:text-gray-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 
              focus:ring-brand-100 disabled:opacity-50 transition-all"
          />
        </div>

        {/* Botón de micrófono */}
        {isSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            aria-label={isListening ? 'Detener micrófono' : 'Activar micrófono'}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-200 
              ${
                isListening
                  ? 'bg-red-500 text-white shadow-lg shadow-red-200 animate-pulse'
                  : 'bg-gray-100 text-gray-500 hover:bg-brand-50 hover:text-brand-600'
              } disabled:opacity-50`}
          >
            {/* Mic icon */}
            <svg
              xmlns="https://cdn.vectorstock.com/i/1000v/26/82/minimal-microphone-icon-or-design-element-vector-19952682.jpg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              {isListening ? (
                // Stop icon cuando está escuchando
                <path d="M6 6h12v12H6z" />
              ) : (
                // Mic icon
                <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.07A7.007 7.007 0 015 11H3a9.009 9.009 0 008 8.93V20a1 1 0 011-1h0a1 1 0 011 1v0z" />
              )}
            </svg>
          </button>
        )}

        {/* Botón de enviar */}
        <button
          type="submit"
          disabled={disabled || !text.trim()}
          aria-label="Enviar mensaje"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white 
            shadow-md shadow-brand-200 transition-all duration-200 hover:bg-brand-700 hover:shadow-lg 
            disabled:opacity-40 disabled:shadow-none disabled:hover:bg-brand-600"
        >
          {/* Send icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 -rotate-45"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>

      {/* Disclaimer */}
      <p className="mt-2 text-center text-[11px] text-gray-400">
        Este asistente <strong>no diagnostica ni receta</strong>. Para evaluación
        clínica, agenda una teleconsulta con el Dr. García.
      </p>
    </div>
  );
}
