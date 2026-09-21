import { AVISO_URGENCIAS } from '@/lib/textos-chat';
import type { SignoDeAlarma } from './tipos';

/**
 * Textos que el paciente ve cuando los agentes deciden sin la IA redactora.
 * Son texto clínico visible: cambiarlos requiere la aprobación del médico.
 *
 * PENDIENTES DE APROBACIÓN (21-sep-2026). Se armaron con frases ya aprobadas:
 * la primera línea es la de las instrucciones v2.1 de la Dra. Hilda (sección 3)
 * y la última es AVISO_URGENCIAS (aprobado el 14-sep-2026). Lo nuevo es la
 * frase del medio, que nombra el signo detectado.
 */

export const ENCABEZADO_URGENCIA =
  '⚠️ Esto requiere atención médica presencial urgente. Por favor acude a urgencias o llama a tu médico de inmediato.';

/** Respuesta del centinela cuando detecta un signo de alarma: la escribe el código, no la IA. */
export function respuestaDeUrgencia(signos: SignoDeAlarma[]): string {
  const nombres = [...new Set(signos.map((s) => s.texto.trim()).filter(Boolean))];
  const detalle =
    nombres.length === 1
      ? `Me describes un signo de alarma: ${nombres[0]}.`
      : `Me describes signos de alarma: ${nombres.join('; ')}.`;
  return `${ENCABEZADO_URGENCIA}\n\n${detalle}\n\n${AVISO_URGENCIAS}`;
}

/** Cuando la respuesta de la IA no pasa el verificador dos veces seguidas. */
export const RESPUESTA_DE_RESPALDO = `No pude preparar una orientación segura para tu mensaje. Para no darte información equivocada, te recomiendo consultarlo con un profesional de la salud.\n\n${AVISO_URGENCIAS}`;
