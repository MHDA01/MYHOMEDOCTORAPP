/**
 * @fileoverview Lo que evita cobrar dos veces el mismo mes. Sin dependencias de
 * Firebase a propósito, para que se pueda probar desde la suite de la app.
 *
 * El problema: `chargeMonthlySubscriptions` corre todos los días y busca las
 * suscripciones con `nextBillingDate` vencida. Solo mueve esa fecha DESPUÉS de
 * que Wompi aprueba. Entre una cosa y la otra hay tres formas de cobrar dos
 * veces:
 *
 *  1. El cargo queda en PENDING: la fecha no se mueve y la corrida del día
 *     siguiente lo vuelve a cobrar mientras el primero sigue vivo.
 *  2. Wompi aprueba pero la escritura en Firestore falla, o la función se
 *     queda sin tiempo: la fecha no se movió y mañana se cobra otra vez.
 *  3. Pub/Sub entrega el disparo dos veces (la entrega es "al menos una vez")
 *     y dos ejecuciones ven la misma suscripción vencida.
 *
 * Dos defensas, en capas:
 *
 *  - **El reclamo** (`cobroEnCurso`): antes de llamar a Wompi, una transacción
 *    de Firestore marca la suscripción como "la estoy cobrando yo". Nadie más
 *    la toca hasta que se resuelva o el reclamo venza. Cubre 1 y 3.
 *  - **La referencia determinista**: la referencia que se le manda a Wompi se
 *    deriva del ciclo que se está cobrando, no de `Date.now()`. Wompi exige
 *    que la referencia sea única por comercio, así que un reintento del mismo
 *    ciclo lo rechaza la pasarela en vez de cobrarlo. Cubre 2, que es la que
 *    ninguna cerradura local puede cubrir sola.
 */

/** Un reclamo que lleve más de esto abierto se considera abandonado. */
export const RECLAMO_VENCE_EN_MS = 6 * 60 * 60 * 1000;

/**
 * Referencia del cobro de un ciclo. Dos ejecuciones del MISMO intento del mismo
 * ciclo producen la misma referencia, y esa es toda la gracia.
 *
 * Lleva el número de intento porque Wompi no deja reusar una referencia ni
 * siquiera cuando el cargo fue rechazado: sin el intento, el reintento del día
 * siguiente —que sí queremos— lo rechazaría la pasarela por repetida.
 *
 * El formato `teleorientacion_recurring_{uid}_{...}` lo lee el webhook para
 * sacar el uid, así que el uid tiene que seguir siendo el tercer pedazo.
 */
export function referenciaDeCiclo(uid: string, cicloMs: number, intento: number): string {
  return `teleorientacion_recurring_${uid}_${cicloMs}i${intento}`;
}

/** Referencia del primer cobro, el de la activación. Ese sí es único por intento. */
export function referenciaDeAlta(uid: string, ahoraMs: number): string {
  return `teleorientacion_recurring_${uid}_alta${ahoraMs}`;
}

/**
 * Saca el uid de una referencia de pago. Devuelve null si la referencia no
 * tiene uno de los dos prefijos conocidos: así un evento con una referencia
 * rara no termina escribiendo en la cuenta equivocada.
 */
export function uidDeReferencia(referencia: unknown): string | null {
  if (typeof referencia !== "string") return null;
  const coincidencia = referencia.match(/^teleorientacion_(?:monthly|recurring)_([A-Za-z0-9]+)_/);
  return coincidencia ? coincidencia[1] : null;
}

/** ¿Hay un cobro de este ciclo en curso que todavía vale? */
export function reclamoVigente(
  reclamo: { ciclo?: unknown; desdeMs?: unknown } | undefined | null,
  ahoraMs: number,
  venceEnMs: number = RECLAMO_VENCE_EN_MS
): boolean {
  if (!reclamo || typeof reclamo.desdeMs !== "number") return false;
  return ahoraMs - reclamo.desdeMs < venceEnMs;
}
