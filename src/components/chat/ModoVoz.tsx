'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, Mic, Square, X } from 'lucide-react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useVozHilda } from '@/hooks/useVozHilda';
import { SALUDO_MODO_VOZ, SILENCIO_PARA_ENVIAR_MS, valeLaPenaEnviar } from '@/lib/voz';
import { AvatarHilda, type EstadoHilda } from '@/components/chat/AvatarHilda';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Modo conversación: consultar a Hilda hablando, sin escribir y sin leer.
 *
 * Para quién es: una persona mayor que no se maneja con el teclado, una madre
 * con el bebé en brazos, alguien que no ve bien. Por eso el ciclo entero es
 * automático —escucha, envía sola cuando el paciente deja de hablar, contesta
 * en voz alta y vuelve a escuchar— y en pantalla hay un solo botón grande.
 *
 * El micrófono y la voz nunca están encendidos a la vez: si lo estuvieran,
 * Hilda se transcribiría a sí misma. De ahí que todo el ciclo sea en fila.
 *
 * Lo que se dice se guarda igual que lo que se escribe: el modo de voz solo
 * cambia cómo entra y sale el mensaje, no qué hace la app con él.
 */

interface ModoVozProps {
  /** Manda el mensaje y devuelve lo que contestó Hilda, o null si no salió. */
  onEnviar: (texto: string) => Promise<string | null>;
  onCerrar: () => void;
  nombrePaciente?: string;
}

export function ModoVoz({ onEnviar, onCerrar, nombrePaciente }: ModoVozProps) {
  const {
    transcript,
    interimTranscript,
    isListening,
    isSupported: micDisponible,
    startListening,
    stopListening,
    resetTranscript,
    error: errorMic,
  } = useSpeechRecognition();
  const { disponible: vozDisponible, hablar, callar, preparar } = useVozHilda();

  const [estado, setEstado] = useState<EstadoHilda>('reposo');
  const [ultimaRespuesta, setUltimaRespuesta] = useState('');
  const [fallo, setFallo] = useState<string | null>(null);

  const estadoRef = useRef<EstadoHilda>('reposo');
  const vivoRef = useRef(true);
  const enviandoRef = useRef(false);
  const loDicho = `${transcript} ${interimTranscript}`.trim();
  const loDichoRef = useRef('');
  loDichoRef.current = loDicho;

  const cambiarEstado = useCallback((nuevo: EstadoHilda) => {
    estadoRef.current = nuevo;
    setEstado(nuevo);
  }, []);

  /** Abre el micrófono y deja el turno en manos del paciente. */
  const escuchar = useCallback(async () => {
    if (!vivoRef.current) return;
    resetTranscript();
    cambiarEstado('escuchando');
    await startListening();
  }, [cambiarEstado, resetTranscript, startListening]);

  /** Manda lo dicho, lo contesta en voz alta y vuelve a escuchar. */
  const enviarYResponder = useCallback(
    async (texto: string) => {
      if (enviandoRef.current || !vivoRef.current) return;
      enviandoRef.current = true;
      stopListening();
      cambiarEstado('pensando');
      setFallo(null);

      try {
        const respuesta = await onEnviar(texto);
        if (!vivoRef.current) return;

        if (!respuesta) {
          setFallo('No se pudo enviar. Toca el botón para intentarlo otra vez.');
          cambiarEstado('reposo');
          return;
        }

        setUltimaRespuesta(respuesta);
        cambiarEstado('hablando');
        await hablar(respuesta);
        if (!vivoRef.current) return;
        // Tanto si terminó como si la cortaron, el turno vuelve al paciente.
        await escuchar();
      } catch {
        if (!vivoRef.current) return;
        setFallo('Algo falló al enviar. Toca el botón para intentarlo otra vez.');
        cambiarEstado('reposo');
      } finally {
        enviandoRef.current = false;
      }
    },
    [cambiarEstado, escuchar, hablar, onEnviar, stopListening]
  );

  // Arranque: Hilda saluda y se pone a escuchar.
  useEffect(() => {
    vivoRef.current = true;
    preparar();
    (async () => {
      cambiarEstado('hablando');
      await hablar(SALUDO_MODO_VOZ);
      if (vivoRef.current) await escuchar();
    })();

    return () => {
      vivoRef.current = false;
      callar();
      stopListening();
    };
    // Solo al abrir y al cerrar: el ciclo se mueve solo a partir de aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // El silencio es lo que manda el mensaje: cada vez que el paciente dice algo
  // nuevo se reinicia la cuenta, y cuando se calla el tiempo suficiente, sale.
  useEffect(() => {
    if (estado !== 'escuchando' || !valeLaPenaEnviar(loDicho)) return;
    const temporizador = window.setTimeout(() => {
      if (estadoRef.current === 'escuchando' && valeLaPenaEnviar(loDichoRef.current)) {
        void enviarYResponder(loDichoRef.current);
      }
    }, SILENCIO_PARA_ENVIAR_MS);
    return () => window.clearTimeout(temporizador);
  }, [loDicho, estado, enviarYResponder]);

  // Si el micrófono falla (permiso denegado, por ejemplo), Hilda no puede
  // seguir diciendo "te escucho": se queda quieta y el botón vuelve a mandar.
  useEffect(() => {
    if (errorMic && estadoRef.current === 'escuchando') cambiarEstado('reposo');
  }, [errorMic, cambiarEstado]);

  // Chrome cierra el micrófono solo tras una pausa larga aunque sea continuo.
  // Si eso pasa con algo dicho, se manda; si no, se vuelve a abrir.
  useEffect(() => {
    if (estado !== 'escuchando' || isListening) return;
    const reanudar = window.setTimeout(() => {
      if (estadoRef.current !== 'escuchando') return;
      if (valeLaPenaEnviar(loDichoRef.current)) void enviarYResponder(loDichoRef.current);
      else void escuchar();
    }, 400);
    return () => window.clearTimeout(reanudar);
  }, [isListening, estado, enviarYResponder, escuchar]);

  /** El botón grande hace lo único que tiene sentido en cada momento. */
  function tocarBoton() {
    if (estado === 'hablando') {
      callar();
      void escuchar();
      return;
    }
    if (estado === 'escuchando') {
      if (valeLaPenaEnviar(loDichoRef.current)) void enviarYResponder(loDichoRef.current);
      else stopListening();
      return;
    }
    if (estado === 'reposo') void escuchar();
  }

  function cerrar() {
    vivoRef.current = false;
    callar();
    stopListening();
    onCerrar();
  }

  const noSePuede = !micDisponible || !vozDisponible;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white" role="dialog" aria-modal="true" aria-label="Hablar con Hilda">
      <header className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-semibold text-muted-foreground">
          {nombrePaciente ? `Consulta sobre ${nombrePaciente}` : 'Consulta por voz'}
        </p>
        <button
          type="button"
          onClick={cerrar}
          aria-label="Cerrar el modo conversación"
          className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-slate-100"
        >
          <X className="h-6 w-6" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 pb-2">
        {noSePuede ? (
          <div className="max-w-sm space-y-3 text-center">
            <AvatarHilda estado="reposo" tamano={120} />
            <p className="text-lg font-semibold text-brand-900">Este teléfono no puede hablar con Hilda</p>
            <p className="text-sm text-muted-foreground">
              {!micDisponible
                ? 'Tu navegador no deja usar el micrófono. Prueba con Chrome.'
                : 'Tu teléfono no tiene ninguna voz en español instalada. Puedes seguir por escrito.'}
            </p>
            <Button onClick={cerrar} className="h-12 w-full text-base">
              <Keyboard className="mr-2 h-5 w-5" />
              Escribir la consulta
            </Button>
          </div>
        ) : (
          <>
            <AvatarHilda estado={estado} tamano={168} />

            {/* Lo que se va entendiendo, para quien sí puede leer y para
                corregir sobre la marcha si el micrófono oyó otra cosa. */}
            <div className="min-h-[4.5rem] w-full max-w-md text-center">
              {estado === 'escuchando' && loDicho && (
                <p className="text-xl leading-snug text-brand-900">{loDicho}</p>
              )}
              {(estado === 'hablando' || estado === 'pensando') && ultimaRespuesta && (
                <p className="max-h-32 overflow-y-auto text-base leading-snug text-muted-foreground">
                  {ultimaRespuesta}
                </p>
              )}
              {fallo && <p className="text-base font-semibold text-destructive">{fallo}</p>}
              {errorMic && !fallo && <p className="text-base font-semibold text-destructive">{errorMic}</p>}
            </div>

            <button
              type="button"
              onClick={tocarBoton}
              disabled={estado === 'pensando'}
              className={cn(
                'flex h-20 w-20 items-center justify-center rounded-full text-white shadow-soft transition-all active:scale-95 disabled:opacity-50',
                estado === 'escuchando' ? 'bg-teal-600' : 'bg-primary'
              )}
              aria-label={
                estado === 'escuchando'
                  ? 'Ya terminé de hablar'
                  : estado === 'hablando'
                    ? 'Interrumpir a Hilda'
                    : 'Empezar a hablar'
              }
            >
              {estado === 'escuchando' || estado === 'hablando' ? (
                <Square className="h-7 w-7" fill="currentColor" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>

            <p className="max-w-xs text-center text-sm text-muted-foreground">
              {estado === 'escuchando'
                ? 'Habla con calma. Cuando termines, espera un momento y se envía sola.'
                : estado === 'hablando'
                  ? 'Toca el botón si quieres interrumpirla y hablar tú.'
                  : estado === 'pensando'
                    ? 'Un momento…'
                    : 'Toca el micrófono para hablar.'}
            </p>
          </>
        )}
      </div>

      {!noSePuede && (
        <footer className="px-6 pb-[max(16px,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={cerrar}
            className="mx-auto flex h-12 items-center gap-2 rounded-full px-5 text-base font-semibold text-primary hover:bg-sky-50"
          >
            <Keyboard className="h-5 w-5" />
            Prefiero escribir
          </button>
          <p className="mt-1 text-center text-[11px] leading-snug text-muted-foreground">
            Hilda no diagnostica ni receta. Si es una emergencia, llama al 123.
          </p>
        </footer>
      )}
    </div>
  );
}
