/**
 * Cuándo se le muestra a la persona el botón de cancelar la renovación.
 *
 * Antes solo aparecía con la renovación `active`. Pero mientras un cobro falla
 * y se reintenta (`payment_failed` con la renovación aún encendida) o está en
 * confirmación (`pending`), la persona también tiene que poder cancelar: es
 * justo cuando más la cobran sin querer.
 *
 * Con `autoRenew` apagado no hay nada que cancelar, sea cual sea el estado.
 */
export const ESTADOS_CANCELABLES = ['active', 'pending', 'payment_failed'] as const;

export function puedeCancelarRenovacion(
  info: { autoRenew?: boolean; subscriptionStatus?: string } | null | undefined
): boolean {
  if (!info || info.autoRenew !== true) return false;
  return (ESTADOS_CANCELABLES as readonly string[]).includes(info.subscriptionStatus ?? '');
}
