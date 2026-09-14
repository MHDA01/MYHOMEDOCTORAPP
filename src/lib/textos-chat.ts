/**
 * Textos que el paciente ve cuando algo del chat falla o se pasa un límite.
 * Aprobados por el fundador el 14-sep-2026 ("consultar a urgencias", en el tono
 * de la app). Cambiarlos requiere su aprobación: son texto clínico visible.
 *
 * Viven fuera de app/actions porque un archivo 'use server' solo puede exportar
 * funciones asíncronas, y el cliente también los usa.
 */

export const AVISO_URGENCIAS = 'Si se trata de una emergencia, por favor consulta a urgencias o llama al 123.';

/** Agrega el aviso de urgencias al final de un mensaje de error del chat. */
export function conAvisoDeUrgencias(mensaje: string): string {
  return `${mensaje}\n\n${AVISO_URGENCIAS}`;
}

export const MENSAJE_MUY_LARGO = 'Tu mensaje es muy largo. Por favor, envíalo en partes más cortas.';

export const IMAGEN_NO_VALIDA = 'No pude leer una de las imágenes. Por favor, vuelve a adjuntarla.';

export const MAX_CARACTERES_MENSAJE = 10_000;

export const MAX_IMAGENES_POR_MENSAJE = 4;
