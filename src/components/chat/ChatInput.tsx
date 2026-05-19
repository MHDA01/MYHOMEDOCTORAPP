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
    interimTranscript,
    isListening,
    isSupported,
    toggleListening,
    stopListening,
    resetTranscript,
    error: speechError,
  } = useSpeechRecognition();

  useEffect(() => {
    const mergedTranscript = `${transcript} ${interimTranscript}`.trim();
    if (mergedTranscript) {
      setText(mergedTranscript);
    }
  }, [transcript, interimTranscript]);

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
    <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:px-6">
      {speechError && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {speechError}
        </div>
      )}

      {isListening && (
        <div className="mb-2 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <div className="flex items-center gap-2 text-xs font-medium text-red-700">
            <span className="inline-flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            Grabando en tiempo real
          </div>
          <p className="max-w-[65%] truncate text-[11px] text-red-700/90">
            {(interimTranscript || transcript).trim() || 'Escuchando...'}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2">
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
            className="w-full resize-none rounded-2xl border border-transparent bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-200 focus:outline-none focus:ring-0 disabled:opacity-50 transition-all"
          />
        </div>

        {/* Botón de micrófono */}
        {isSupported && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={disabled}
            aria-label={isListening ? 'Detener micrófono' : 'Activar micrófono'}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
              isListening
                ? 'border-red-400 bg-red-500 text-white animate-pulse-ring'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            } disabled:opacity-50`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              {isListening ? (
                <path d="M6 6h12v12H6z" />
              ) : (
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
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition-all duration-200 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-900"
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
      <p className="mt-2 text-center text-[11px] text-slate-400">
        Este asistente no diagnostica ni receta. Para evaluación clínica, agenda una teleconsulta.
      </p>
    </div>
  );
}
