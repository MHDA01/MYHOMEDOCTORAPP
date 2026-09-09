// ============================================================
// components/chat/ChatInput.tsx — Input de chat con micrófono y envío
// ============================================================
'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { Camera, ImagePlus, Aperture } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

interface ChatInputProps {
  onSend: (message: string, images?: File[]) => void;
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
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    hasPermission,
    toggleListening,
    stopListening,
    resetTranscript,
    clearError,
    error: speechError,
  } = useSpeechRecognition();
  const [micErrorFx, setMicErrorFx] = useState(false);

  // Borrador del mensaje en curso.
  //
  // La app se actualiza sola y recarga la página en cuanto detecta una versión
  // nueva (ver components/app-update-manager.tsx). Sin esto, a un paciente que
  // estuviera describiendo sus síntomas se le perdería el texto.
  //
  // Se usa sessionStorage y no localStorage a propósito: sobrevive la recarga,
  // que es lo único que hace falta, pero no deja texto clínico guardado en el
  // dispositivo una vez cerrada la pestaña.
  const claveBorrador = `mhda:borrador-chat:${memberName || 'principal'}`;

  useEffect(() => {
    try {
      const guardado = sessionStorage.getItem(claveBorrador);
      if (guardado) setText(guardado);
    } catch {
      // sessionStorage puede fallar (modo privado, permisos bloqueados). El
      // borrador es un extra: si no está disponible, el chat funciona igual.
    }
  }, [claveBorrador]);

  useEffect(() => {
    try {
      if (text) sessionStorage.setItem(claveBorrador, text);
      else sessionStorage.removeItem(claveBorrador);
    } catch {
      // Ver nota anterior.
    }
  }, [text, claveBorrador]);

  useEffect(() => {
    // Solo el dictado por voz debe sobreescribir el input. Sin este guard, un transcript
    // remanente de una sesión de micrófono anterior podía pisar el texto que el usuario
    // escribe a mano (pérdida intermitente de caracteres — riesgo de integridad clínica).
    if (!isListening) return;
    const mergedTranscript = `${transcript} ${interimTranscript}`.trim();
    if (mergedTranscript) {
      setText(mergedTranscript);
    }
  }, [transcript, interimTranscript, isListening]);

  useEffect(() => {
    if (!speechError) return;
    setMicErrorFx(true);
    const fxTimer = window.setTimeout(() => setMicErrorFx(false), 450);
    const clearTimer = window.setTimeout(() => clearError(), 3000);
    return () => {
      window.clearTimeout(fxTimer);
      window.clearTimeout(clearTimer);
    };
  }, [speechError, clearError]);

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
    if ((!trimmed && selectedImages.length === 0) || disabled) return;

    if (isListening) stopListening();
    onSend(trimmed || 'Adjunto imágenes para orientación clínica.', selectedImages);
    setText('');
    setSelectedImages([]);
    resetTranscript();

    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleMicClick = async () => {
    if (disabled) return;
    await toggleListening();
  };

  const handleTakePhotoClick = () => {
    if (disabled) return;
    cameraInputRef.current?.click();
  };

  const handleUploadFileClick = () => {
    if (disabled) return;
    galleryInputRef.current?.click();
  };

  const handleImageSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;

    const validType = picked.filter((file) => /image\/(jpeg|jpg|png)/i.test(file.type));
    const validSize = validType.filter((file) => file.size <= MAX_IMAGE_SIZE_BYTES);

    if (validSize.length < picked.length) {
      setImageError(
        validType.length < picked.length
          ? 'Solo se permiten imágenes JPG o PNG.'
          : `Cada imagen debe pesar menos de ${MAX_IMAGE_SIZE_MB}MB.`
      );
    } else {
      setImageError(null);
    }

    if (!validSize.length) return;
    setSelectedImages((prev) => [...prev, ...validSize].slice(0, 4));
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const defaultPlaceholder = memberName
    ? `Escribe tu consulta sobre ${memberName}...`
    : 'Escribe tu consulta...';

  return (
    <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:px-6">
      {speechError && (
        <div className="mb-2 px-1 text-xs text-red-600">
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

      {imageError && (
        <div className="mb-2 px-1 text-xs text-red-600">
          {imageError}
        </div>
      )}

      {selectedImages.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2 rounded-lg border border-blue-100 bg-blue-50 p-2">
          {selectedImages.map((file, index) => (
            <div key={`${file.name}-${index}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs text-slate-700">
              <span className="max-w-[140px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => removeSelectedImage(index)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Quitar imagen"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        {/* Textarea */}
        <div className="relative flex-1">
          <textarea
            id="chat-message-input"
            name="chat-message"
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

        {/* Input oculto: cámara — fuerza la app de cámara en móvil */}
        <input
          id="chat-camera-capture"
          name="chat-camera-capture"
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          capture="environment"
          className="hidden"
          onChange={handleImageSelection}
          aria-label="Tomar foto"
        />

        {/* Input oculto: galería / explorador de archivos */}
        <input
          id="chat-image-upload"
          name="chat-image-upload"
          ref={galleryInputRef}
          type="file"
          accept="image/jpeg,image/jpg,image/png"
          multiple
          className="hidden"
          onChange={handleImageSelection}
          aria-label="Subir imagen clínica"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <button
              type="button"
              disabled={disabled}
              aria-label="Tomar o subir foto"
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-blue-500 bg-blue-50 text-blue-600 transition-all duration-200 hover:bg-blue-100 disabled:opacity-50"
            >
              <Camera className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top">
            <DropdownMenuItem onClick={handleTakePhotoClick}>
              <Aperture className="mr-2 h-4 w-4" />
              Tomar foto
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleUploadFileClick}>
              <ImagePlus className="mr-2 h-4 w-4" />
              Subir archivo
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Botón de micrófono */}
        {isSupported ? (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={disabled}
            aria-label={isListening ? 'Detener micrófono' : 'Activar micrófono'}
            className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
              isListening && hasPermission
                ? 'border-red-400 bg-red-500 text-white animate-pulse-ring'
                : 'border-teal-500 bg-teal-50 text-teal-600 hover:bg-teal-100'
            } ${micErrorFx ? 'animate-shake-x' : ''} disabled:opacity-50`}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-5 w-5"
            >
              {isListening && hasPermission ? (
                <path d="M6 6h12v12H6z" />
              ) : (
                <path d="M12 14a3 3 0 003-3V5a3 3 0 10-6 0v6a3 3 0 003 3zm5-3a5 5 0 01-10 0H5a7 7 0 0014 0h-2zm-5 9a1 1 0 01-1-1v-1.07A7.007 7.007 0 015 11H3a9.009 9.009 0 008 8.93V20a1 1 0 011-1h0a1 1 0 011 1v0z" />
              )}
            </svg>
          </button>
        ) : (
          <p className="px-2 text-[11px] text-slate-500">Tu navegador no soporta el micrófono. Usa Chrome.</p>
        )}

        {/* Botón de enviar — siempre visible */}
        <button
          type="submit"
          disabled={disabled}
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
