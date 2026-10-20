/**
 * Modalidad de acceso de una cuenta: el tipo y sus nombres, sin nada del
 * servidor.
 *
 * Vive aparte de `modalidad-acceso.ts` porque de eso también come el panel en
 * el navegador, y aquel importa firebase-admin (que no existe fuera del
 * servidor). Aquí no se puede importar nada de Firebase.
 *
 * - `gratis_ilimitado`: entra siempre, sin tokens y sin pagar. Es la promesa a
 *   quienes se registraron durante la etapa gratuita.
 * - `pago`: pasa por el sistema de tokens y por la pasarela cuando el cobro
 *   esté encendido. Es lo que se asume para quien no tenga nada escrito.
 */

export type Modalidad = 'gratis_ilimitado' | 'pago';

export const MODALIDADES: Modalidad[] = ['gratis_ilimitado', 'pago'];

/** Lo que se asume de una cuenta sin registro de modalidad. */
export const MODALIDAD_POR_DEFECTO: Modalidad = 'pago';

export const NOMBRE_MODALIDAD: Record<Modalidad, string> = {
  gratis_ilimitado: 'Gratis ilimitado',
  pago: 'Pago',
};

export function esModalidad(valor: unknown): valor is Modalidad {
  return typeof valor === 'string' && (MODALIDADES as string[]).includes(valor);
}
