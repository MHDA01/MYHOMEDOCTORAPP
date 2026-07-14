'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface UseSpeechRecognitionReturn {
  transcript: string;
  interimTranscript: string;
  isListening: boolean;
  isSupported: boolean;
  hasPermission: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
  toggleListening: () => Promise<void>;
  resetTranscript: () => void;
  clearError: () => void;
  error: string | null;
}

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        recognitionRef.current.abort();
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const startListening = useCallback(async () => {
    if (isListeningRef.current) return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Tu navegador no soporta el micrófono. Usa Chrome.');
      return;
    }

    // Evita pedir permiso dos veces (getUserMedia + SpeechRecognition) cuando ya está concedido.
    let alreadyGranted = false;
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        alreadyGranted = status.state === 'granted';
      }
    } catch {
      // Permissions API no disponible para 'microphone' en este navegador; seguimos con el flujo normal.
    }

    if (alreadyGranted) {
      setHasPermission(true);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
        setHasPermission(true);
      } catch (err) {
        setHasPermission(false);
        setError('Permiso de micrófono denegado. Actívalo en la configuración de tu navegador.');
        return;
      }
    }

    setTranscript('');
    setInterimTranscript('');
    setIsListening(true);

    const recognition: SpeechRecognitionLike = new SpeechRecognition();
    recognition.lang = 'es-CO';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let final = '';
      let interim = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += `${result[0].transcript} `;
        } else {
          interim += result[0].transcript;
        }
      }
      setTranscript(final.trim());
      setInterimTranscript(interim.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') {
        // No son errores reales: el usuario no dijo nada o detuvo la grabación a propósito.
        return;
      }
      console.error('SpeechRecognition error:', event.error);
      setError('Error al escuchar. Intenta de nuevo.');
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const toggleListening = useCallback(async () => {
    if (isListeningRef.current) {
      stopListening();
      return;
    }
    await startListening();
  }, [startListening, stopListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    transcript,
    interimTranscript,
    isListening,
    isSupported,
    startListening,
    stopListening,
    toggleListening,
    resetTranscript,
    clearError,
    error,
    hasPermission,
  };
}
