/**
 * Cancelar la renovación: cuándo se puede, qué dice el correo de constancia y que
 * un cobro que se aprueba tarde no deshace una cancelación.
 *
 * Las funciones de `functions/` no dependen de Firebase en estos módulos, así que
 * se prueban desde aquí (igual que `cobro-seguro.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { puedeCancelarRenovacion } from '../../src/lib/cancelar-renovacion';
import { camposTrasCobroAprobado } from '../../functions/src/estado-suscripcion';
import { correoCancelacion, URL_MI_CUENTA } from '../../functions/src/correos-cobro';

describe('Cuándo se muestra el botón de cancelar', () => {
  it('con la renovación encendida, en activa, en confirmación y con el pago fallando', () => {
    for (const subscriptionStatus of ['active', 'pending', 'payment_failed']) {
      expect(puedeCancelarRenovacion({ autoRenew: true, subscriptionStatus })).toBe(true);
    }
  });

  it('no aparece si ya está cancelada ni si nunca hubo renovación', () => {
    expect(puedeCancelarRenovacion({ autoRenew: false, subscriptionStatus: 'cancelled' })).toBe(false);
    expect(puedeCancelarRenovacion({ autoRenew: false, subscriptionStatus: 'none' })).toBe(false);
    expect(puedeCancelarRenovacion({ subscriptionStatus: 'active' })).toBe(false);
  });

  it('con la renovación apagada no hay nada que cancelar, sea cual sea el estado', () => {
    for (const subscriptionStatus of ['active', 'pending', 'payment_failed']) {
      expect(puedeCancelarRenovacion({ autoRenew: false, subscriptionStatus })).toBe(false);
    }
  });

  it('sin datos de suscripción no hay botón', () => {
    expect(puedeCancelarRenovacion(null)).toBe(false);
    expect(puedeCancelarRenovacion(undefined)).toBe(false);
    expect(puedeCancelarRenovacion({ autoRenew: true })).toBe(false);
  });
});

describe('Un cobro aprobado tarde no deshace la cancelación', () => {
  const siguiente = new Date('2026-12-13T15:00:00Z');

  it('un cobro recurrente aprobado vuelve a encender la renovación', () => {
    expect(camposTrasCobroAprobado({ subscriptionStatus: 'pending' }, true, siguiente)).toEqual({
      autoRenew: true,
      subscriptionStatus: 'active',
      nextBillingDate: siguiente,
      failedChargeAttempts: 0,
    });
  });

  it('si la persona canceló mientras el cobro estaba en confirmación, se respeta la cancelación', () => {
    expect(camposTrasCobroAprobado({ subscriptionStatus: 'cancelled' }, true, siguiente)).toEqual({});
  });

  it('el pago inicial (no recurrente) no toca la renovación', () => {
    expect(camposTrasCobroAprobado({ subscriptionStatus: 'pending' }, false, siguiente)).toEqual({});
  });

  it('sin documento previo, un recurrente aprobado se comporta como siempre', () => {
    expect(camposTrasCobroAprobado(undefined, true, siguiente)).toMatchObject({ autoRenew: true, subscriptionStatus: 'active' });
  });
});

describe('Correo de constancia de cancelación', () => {
  it('dice hasta qué día hay acceso y que no habrá más cobros', () => {
    const c = correoCancelacion({ accesoHasta: new Date('2026-12-13T15:00:00Z') });
    expect(c.asunto).toBe('Cancelamos tu renovación');
    expect(c.html).toContain('13 de diciembre de 2026');
    expect(c.html).toContain('no te cobraremos más');
  });

  it('lleva el enlace directo a Mi cuenta', () => {
    const c = correoCancelacion({});
    expect(c.html).toContain(`href="${URL_MI_CUENTA}"`);
  });

  it('sin fecha conocida no inventa una', () => {
    const c = correoCancelacion({ accesoHasta: null });
    expect(c.html).toContain('hasta el final del período que ya pagaste');
    const invalida = correoCancelacion({ accesoHasta: new Date('no es una fecha') });
    expect(invalida.html).toContain('hasta el final del período que ya pagaste');
  });

  it('avisa del pago en confirmación solo cuando lo había', () => {
    expect(correoCancelacion({ cobroEnConfirmacion: true }).html).toContain('pago en confirmación');
    expect(correoCancelacion({ cobroEnConfirmacion: false }).html).not.toContain('pago en confirmación');
  });
});
