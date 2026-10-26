'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CARACTERES_POR_TROZO, VELOCIDAD_VOZ, elegirVoz, limpiarParaVoz, partirParaVoz } from '@/lib/voz';

/**
 * La voz de Hilda: dice en voz alta lo que ella responde.
 *
 * Usa el sintetizador del propio aparato (`speechSynthesis`): no cuesta nada
 * por consulta, funciona sin conexión y no manda el texto clínico a un tercero.
 * A cambio, la voz es la que traiga el teléfono. `hablar` es el único punto que
 * habría que cambiar para pasar a una voz propia por servidor.
 *
 * Reglas que el hook garantiza:
 *  - solo se habla de una cosa a la vez; empezar algo nuevo calla lo anterior;
 *  - `hablar` resuelve `true` si terminó la frase y `false` si la cortaron, que
 *    es lo que el modo conversación necesita para saber cuándo volver a escuchar;
 *  - si el aparato no tiene ninguna voz en español, no se habla (mejor callada
 *    que leyendo español con acento inglés).
 */

const CLAVE_PREFERENCIA = 'mhda:voz-hilda';

export type EstadoVoz = 'callada' | 'hablando';

export interface UseVozHildaReturn {
  /** El aparato sabe hablar y tiene al menos una voz en español. */
  disponible: boolean;
  /** El paciente la dejó encendida. Se recuerda en este aparato. */
  activa: boolean;
  cambiarActiva: (valor: boolean) => void;
  estado: EstadoVoz;
  /** Dice el texto. Resuelve true si lo terminó, false si lo cortaron o no se pudo. */
  hablar: (texto: string) => Promise<boolean>;
  callar: () => void;
  /** Desbloquea el sintetizador dentro de un gesto del usuario (hace falta en iPhone). */
  preparar: () => void;
}

function leerPreferencia(): boolean {
  try {
    // Por defecto encendida: el modo conversación no tendría sentido en silencio.
    return localStorage.getItem(CLAVE_PREFERENCIA) !== 'no';
  } catch {
    return true;
  }
}

/**
 * El catálogo de voces del navegador. Chrome lo entrega tarde: la primera
 * llamada a `getVoices()` devuelve una lista vacía y el catálogo real llega
 * después, por el evento `voiceschanged`. Por eso se pregunta en el momento de
 * hablar y, si todavía no está, se espera un poco en vez de darse por vencido.
 */
function vocesCuandoEsten(espera = 2000): Promise<SpeechSynthesisVoice[]> {
  const sintetizador = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!sintetizador) return Promise.resolve([]);

  const yaEstan = sintetizador.getVoices();
  if (yaEstan.length) return Promise.resolve(yaEstan);

  return new Promise((resolver) => {
    const terminar = () => {
      sintetizador.removeEventListener('voiceschanged', terminar);
      window.clearTimeout(reloj);
      resolver(sintetizador.getVoices());
    };
    const reloj = window.setTimeout(terminar, espera);
    sintetizador.addEventListener('voiceschanged', terminar);
  });
}

export function useVozHilda(): UseVozHildaReturn {
  const [voces, setVoces] = useState<SpeechSynthesisVoice[]>([]);
  /** Hasta que el navegador conteste, no se sabe si hay voces; no es que no haya. */
  const [catalogoLeido, setCatalogoLeido] = useState(false);
  const [estado, setEstado] = useState<EstadoVoz>('callada');
  const [activa, setActiva] = useState(true);
  /** Cada llamada a `hablar` tiene su número; si cambia, lo viejo se descarta. */
  const turnoRef = useRef(0);
  const preparadoRef = useRef(false);

  useEffect(() => {
    setActiva(leerPreferencia());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    const leerVoces = () => {
      const lista = window.speechSynthesis.getVoices();
      setVoces(lista);
      if (lista.length) setCatalogoLeido(true);
    };
    leerVoces();
    // En Chrome el catálogo llega tarde y la primera lectura viene vacía.
    window.speechSynthesis.addEventListener('voiceschanged', leerVoces);
    // Si pasado un tiempo razonable no llegó nada, es que de verdad no hay voces.
    const rendirse = window.setTimeout(() => setCatalogoLeido(true), 2500);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', leerVoces);
      window.clearTimeout(rendirse);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Mientras el catálogo no haya llegado no se sabe si hay voces, así que se
  // supone que sí: dar por imposible la voz antes de preguntar hacía que el
  // modo conversación mostrara "este teléfono no puede hablar" durante un
  // instante, y sobre todo que el saludo se saltara en silencio.
  const disponible = !catalogoLeido || elegirVoz(voces) !== null;

  const callar = useCallback(() => {
    turnoRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Si el motor ya no está, no hay nada que callar.
    }
    setEstado('callada');
  }, []);

  const cambiarActiva = useCallback(
    (valor: boolean) => {
      setActiva(valor);
      if (!valor) callar();
      try {
        localStorage.setItem(CLAVE_PREFERENCIA, valor ? 'si' : 'no');
      } catch {
        // Sin almacenamiento la preferencia dura lo que la sesión; no es grave.
      }
    },
    [callar]
  );

  /**
   * iPhone no deja hablar si la primera llamada no nace de un toque. Se gasta
   * un enunciado vacío dentro del gesto que enciende el modo conversación.
   */
  const preparar = useCallback(() => {
    if (preparadoRef.current || typeof window === 'undefined' || !window.speechSynthesis) return;
    try {
      const vacio = new SpeechSynthesisUtterance(' ');
      vacio.volume = 0;
      window.speechSynthesis.speak(vacio);
      preparadoRef.current = true;
    } catch {
      // Si no se puede preparar, el primer intento real fallará y se verá en pantalla.
    }
  }, []);

  const hablar = useCallback(
    async (texto: string): Promise<boolean> => {
      const sintetizador = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      const limpio = limpiarParaVoz(texto);
      if (!sintetizador || !limpio) return false;

      // El catálogo se pregunta AQUÍ, no se toma del estado. El saludo del modo
      // conversación sale en cuanto se monta la pantalla, antes de que Chrome
      // haya entregado las voces; leyéndolo del estado, `elegirVoz` recibía una
      // lista vacía y Hilda se quedaba muda sin decir por qué.
      const voz = elegirVoz(voces.length ? voces : await vocesCuandoEsten());
      if (!voz) return false;

      // Lo nuevo manda: se calla lo anterior y se toma el turno.
      sintetizador.cancel();
      turnoRef.current += 1;
      const turno = turnoRef.current;
      const trozos = partirParaVoz(limpio, MAX_CARACTERES_POR_TROZO);
      setEstado('hablando');

      return new Promise<boolean>((resolver) => {
        let i = 0;
        // Chrome deja de hablar solo pasados unos segundos si no se le insiste.
        const insistir = window.setInterval(() => {
          if (turnoRef.current !== turno) return;
          try {
            if (sintetizador.speaking && !sintetizador.paused) sintetizador.resume();
          } catch {
            // Ignorado a propósito: es un parche de navegador, no una función.
          }
        }, 5000);

        const terminar = (completado: boolean) => {
          window.clearInterval(insistir);
          if (turnoRef.current === turno) setEstado('callada');
          resolver(completado);
        };

        const siguiente = () => {
          if (turnoRef.current !== turno) return terminar(false);
          if (i >= trozos.length) return terminar(true);

          const frase = new SpeechSynthesisUtterance(trozos[i]);
          i += 1;
          frase.voice = voz;
          frase.lang = voz.lang;
          frase.rate = VELOCIDAD_VOZ;
          frase.onend = siguiente;
          frase.onerror = () => {
            // 'interrupted'/'canceled' son lo normal cuando alguien corta a Hilda.
            terminar(false);
          };
          try {
            sintetizador.speak(frase);
          } catch {
            terminar(false);
          }
        };

        siguiente();
      });
    },
    [voces]
  );

  return { disponible, activa, cambiarActiva, estado, hablar, callar, preparar };
}
