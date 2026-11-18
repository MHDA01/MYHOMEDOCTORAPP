/**
 * Cómo se muestra un pago en «Mi cuenta». Solo texto y cuentas: sin Firebase,
 * para poder probarlo desde `tests/`.
 */

export type EstadoPago = 'success' | 'pending' | 'failed' | 'cancelled';

const ETIQUETAS: Record<EstadoPago, string> = {
  success: 'Aprobado',
  pending: 'En confirmación',
  failed: 'Rechazado',
  cancelled: 'Cancelado',
};

/** Lo que dice la etiqueta de un pago. Un estado desconocido no se disfraza de otro. */
export function etiquetaDePago(estado: string | undefined): string {
  return ETIQUETAS[estado as EstadoPago] ?? 'Sin estado';
}

/** `$34.900` (sin «COP»: el título de la sección ya habla de pesos). */
export function pesosCop(valor: number): string {
  return `$${valor.toLocaleString('es-CO')}`;
}

/** Un pago en confirmación se vuelve «raro» pasadas 24 horas: ahí se le dice a la persona qué hacer. */
export const HORAS_PARA_ALERTAR_PAGO_PENDIENTE = 24;

export function pagoPendienteDemasiado(
  estado: string | undefined,
  creadoEn: Date | null | undefined,
  ahora: Date = new Date()
): boolean {
  if (estado !== 'pending' || !creadoEn || Number.isNaN(creadoEn.getTime())) return false;
  return ahora.getTime() - creadoEn.getTime() >= HORAS_PARA_ALERTAR_PAGO_PENDIENTE * 3_600_000;
}
