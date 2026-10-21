'use client';

import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Hilda en pantalla, con el estado de la conversación a la vista.
 *
 * El modo conversación es para quien no va a leer: una señora mayor, alguien
 * con el bebé en brazos. Así que el estado no se cuenta solo con una frase,
 * se ve — color, movimiento y forma distintos en cada uno — y además se anuncia
 * por `aria-live` para los lectores de pantalla. Si el sistema pide menos
 * movimiento, las animaciones se apagan solas (globals.css) y quedan el color
 * y el texto.
 */

export type EstadoHilda = 'reposo' | 'escuchando' | 'pensando' | 'hablando';

const TEXTO: Record<EstadoHilda, string> = {
  reposo: 'Toca para hablar',
  escuchando: 'Te escucho…',
  pensando: 'Hilda está pensando…',
  hablando: 'Hilda está hablando',
};

const ANILLO: Record<EstadoHilda, string> = {
  reposo: 'ring-border',
  escuchando: 'ring-teal-400',
  pensando: 'ring-amber-300',
  hablando: 'ring-sky-400',
};

const ONDA: Record<EstadoHilda, string> = {
  reposo: 'bg-transparent',
  escuchando: 'bg-teal-300',
  pensando: 'bg-transparent',
  hablando: 'bg-transparent',
};

/** Las cinco barras de la onda de voz, cada una con su propio desfase. */
const RETRASOS = ['0ms', '140ms', '70ms', '210ms', '35ms'];

export function AvatarHilda({
  estado,
  tamano = 160,
  className,
}: {
  estado: EstadoHilda;
  tamano?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-3', className)}>
      <div className="relative flex items-center justify-center" style={{ width: tamano, height: tamano }}>
        {/* Ondas de escucha: dos, desfasadas, para que nunca se apague del todo. */}
        {estado === 'escuchando' && (
          <>
            <span className={cn('absolute inset-0 rounded-full animate-onda-escucha', ONDA[estado])} aria-hidden />
            <span
              className={cn('absolute inset-0 rounded-full animate-onda-escucha', ONDA[estado])}
              style={{ animationDelay: '1s' }}
              aria-hidden
            />
          </>
        )}

        {/* Anillo que gira mientras piensa. */}
        {estado === 'pensando' && (
          <span
            className="absolute inset-[-6px] rounded-full border-[3px] border-dashed border-amber-300 animate-giro-lento"
            aria-hidden
          />
        )}

        <Image
          src="/images/dra-hilda-avatar.png"
          alt="Hilda"
          width={tamano}
          height={tamano}
          priority
          className={cn(
            'relative rounded-full bg-white object-cover shadow-soft ring-4 transition-colors duration-300',
            ANILLO[estado],
            estado === 'hablando' && 'animate-respira-voz'
          )}
          style={{ width: tamano, height: tamano }}
        />

        {/* Onda de voz mientras habla. */}
        {estado === 'hablando' && (
          <span
            className="absolute -bottom-1 flex h-7 items-end gap-1 rounded-full bg-white/95 px-3 py-1.5 shadow-soft"
            aria-hidden
          >
            {RETRASOS.map((retraso, i) => (
              <span
                key={i}
                className="h-4 w-1 origin-bottom rounded-full bg-sky-500 animate-barra-voz"
                style={{ animationDelay: retraso }}
              />
            ))}
          </span>
        )}
      </div>

      <p
        aria-live="polite"
        className={cn(
          'text-center text-base font-semibold',
          estado === 'escuchando' && 'text-teal-700',
          estado === 'pensando' && 'text-amber-700',
          estado === 'hablando' && 'text-sky-700',
          estado === 'reposo' && 'text-muted-foreground'
        )}
      >
        {TEXTO[estado]}
      </p>
    </div>
  );
}
