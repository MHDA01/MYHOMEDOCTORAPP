'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_CARACTERES_POR_TROZO, VELOCIDAD_VOZ, elegirVoz, limpiarParaVoz, partirParaVoz } from '@/lib/voz';
import { sintetizarVozHilda } from '@/app/actions/voz-hilda';
import { auth } from '@/lib/firebase';

/**
 * La voz de Hilda: dice en voz alta lo que ella responde.
 *
 * Tiene dos motores y los usa en este orden:
 *
 *  1. **La voz del servidor (Erinome)**, la misma que el personaje tiene en los
 *     videos. Suena a persona, que es lo único que hace usable el modo
 *     conversación para quien no va a leer la pantalla. Cuesta por carácter.
 *  2. **El sintetizador del aparato**, si lo primero falla. Suena a máquina,
 *     pero es gratis, funciona sin conexión y evita que Hilda se quede muda
 *     justo cuando alguien le está hablando.
 *
 * El texto se trocea por frases y los trozos se piden de uno en uno: generar la
 * respuesta entera tarda más de dos segundos, y esa espera antes de que Hilda
 * abra la boca se nota demasiado. Mientras suena un trozo se va pidiendo el
 * siguiente.
 *
 * Reglas que el hook garantiza, con cualquiera de los dos motores:
 *  - solo se habla de una cosa a la vez; empezar algo nuevo calla lo anterior;
 *  - `hablar` resuelve `true` si terminó la frase y `false` si la cortaron, que
 *    es lo que el modo conversación necesita para saber cuándo volver a escuchar.
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

    const leerVoces = () => setVoces(window.speechSynthesis.getVoices());
    leerVoces();
    // En Chrome el catálogo llega tarde y la primera lectura viene vacía.
    window.speechSynthesis.addEventListener('voiceschanged', leerVoces);

    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', leerVoces);
      window.speechSynthesis.cancel();
    };
  }, []);

  // Desde que la voz la pone el servidor, que el aparato tenga o no voces en
  // español dejó de decidir nada: cualquier navegador que sepa reproducir un
  // MP3 puede hablar con la voz de Hilda. Se conserva el campo porque el modo
  // conversación lo consulta, pero ya no hay razón para cerrarle la puerta a
  // nadie antes de intentarlo.
  const disponible = true;

  /** El reproductor del audio del servidor. Uno solo, reutilizado. */
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const callar = useCallback(() => {
    turnoRef.current += 1;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      // Si el motor ya no está, no hay nada que callar.
    }
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
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
   * iPhone no deja sonar nada —ni voz sintetizada ni un audio— si la primera
   * reproducción no nace de un toque. Se gastan las dos primeras dentro del
   * gesto que enciende el modo conversación: un enunciado vacío para el
   * sintetizador y un audio mudo para el reproductor.
   */
  const preparar = useCallback(() => {
    if (preparadoRef.current || typeof window === 'undefined') return;
    preparadoRef.current = true;

    try {
      if (window.speechSynthesis) {
        const vacio = new SpeechSynthesisUtterance(' ');
        vacio.volume = 0;
        window.speechSynthesis.speak(vacio);
      }
    } catch {
      // Si no se puede preparar, el primer intento real fallará y se verá en pantalla.
    }

    try {
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.muted = true;
      // Un MP3 de silencio, el más corto que se puede escribir.
      audio.src =
        'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tUxAADB8AhSmxhIIEVCSiJrDCQBTcu3UrAIwUdkRgQbFAZC1CQEwTJ9mjRvBA4UOLD8nKVOWfh+UlK3z/177OXrfOdKl7pyn3Xf//WreyTRUoAWgBgkOAGbZHBgG1OF6zM82DWbZaUmMBptgQhGjsyYqc9ae9XFz280948NMBWInljyzsNRFLPWdnZGWrddDsjK1unuSrVN9jJsK8KuQtQCtMBjCEtImISdNKJOopIpBFpNSMbIHCSRpRR5iakjTiyzLhchUUBwCgyKiweBv/7UsQbg8isVNoMPMjAAAA0gAAABEVF/4EBYHAIGAsHgaA4AwKAIBAIAgIBAECgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAgEAg';
      void audio.play().then(
        () => {
          audio.pause();
          audio.muted = false;
        },
        () => {
          audio.muted = false;
        }
      );
    } catch {
      // Igual que arriba: si no se desbloquea, se verá al primer intento real.
    }
  }, []);

  /** Pide al servidor el audio de un trozo. null si no se pudo. */
  const pedirAudio = useCallback(async (token: string, trozo: string): Promise<string | null> => {
    try {
      const resultado = await sintetizarVozHilda(token, trozo);
      return resultado.ok ? resultado.audio : null;
    } catch {
      return null;
    }
  }, []);

  /** Reproduce un MP3 en base64. Resuelve false si lo cortaron o no sonó. */
  const reproducir = useCallback((base64: string, turno: number): Promise<boolean> => {
    return new Promise<boolean>((resolver) => {
      if (turnoRef.current !== turno) return resolver(false);

      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;

      let resuelto = false;
      const acabar = (completado: boolean) => {
        if (resuelto) return;
        resuelto = true;
        audio.onended = null;
        audio.onerror = null;
        resolver(completado);
      };

      audio.onended = () => acabar(turnoRef.current === turno);
      audio.onerror = () => acabar(false);
      audio.src = `data:audio/mpeg;base64,${base64}`;
      audio.play().catch(() => acabar(false));
    });
  }, []);

  /** El sintetizador del aparato. Es la red de seguridad, no la primera opción. */
  const decirConNavegador = useCallback(
    async (trozos: string[], turno: number): Promise<boolean> => {
      const sintetizador = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
      if (!sintetizador) return false;

      // El catálogo se pregunta AQUÍ, no se toma del estado: cuando esto corre
      // puede que Chrome aún no lo haya entregado, y con una lista vacía
      // `elegirVoz` devolvía null y Hilda se quedaba muda sin decir por qué.
      const voz = elegirVoz(voces.length ? voces : await vocesCuandoEsten());
      if (!voz) return false;

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

  const hablar = useCallback(
    async (texto: string): Promise<boolean> => {
      const limpio = limpiarParaVoz(texto);
      if (!limpio) return false;

      // Lo nuevo manda: se calla lo anterior y se toma el turno.
      try {
        window.speechSynthesis?.cancel();
      } catch {
        // Si el motor ya no está, no hay nada que callar.
      }
      audioRef.current?.pause();
      turnoRef.current += 1;
      const turno = turnoRef.current;

      const trozos = partirParaVoz(limpio, MAX_CARACTERES_POR_TROZO);
      setEstado('hablando');

      const terminar = (completado: boolean) => {
        if (turnoRef.current === turno) setEstado('callada');
        return completado;
      };

      const token = await auth.currentUser?.getIdToken().catch(() => null);

      if (token) {
        // Se pide el siguiente trozo mientras suena el actual: generar la
        // respuesta entera de una vez tarda más de dos segundos, y esa espera
        // antes de que Hilda abra la boca es justo lo que hay que evitar.
        let pendiente = pedirAudio(token, trozos[0]);

        for (let i = 0; i < trozos.length; i++) {
          const audio = await pendiente;
          if (turnoRef.current !== turno) return terminar(false);

          if (!audio) {
            // La voz buena falló a mitad: mejor la del aparato que el silencio.
            return terminar(await decirConNavegador(trozos.slice(i), turno));
          }

          pendiente = i + 1 < trozos.length ? pedirAudio(token, trozos[i + 1]) : Promise.resolve(null);

          if (!(await reproducir(audio, turno))) return terminar(false);
        }

        return terminar(true);
      }

      return terminar(await decirConNavegador(trozos, turno));
    },
    [decirConNavegador, pedirAudio, reproducir]
  );

  return { disponible, activa, cambiarActiva, estado, hablar, callar, preparar };
}
