/**
 * Paso 5 de la auditoría: lo que evita cobrar dos veces.
 *
 * Vive en `functions/` (despliegue aparte) pero no depende de Firebase, así
 * que se prueba desde aquí.
 *
 * Las pruebas de la firma de Meta se fueron con el agente de ventas, eliminado
 * el 20-oct-2026.
 */
import { describe, expect, it } from 'vitest';
import {
  RECLAMO_VENCE_EN_MS,
  referenciaDeAlta,
  referenciaDeCiclo,
  reclamoVigente,
  uidDeReferencia,
} from '../../functions/src/cobro-idempotente';

const UID = 'abc123XYZ';
const CICLO = 1_793_000_000_000;

describe('Referencias de cobro', () => {
  it('el mismo ciclo y el mismo intento dan la misma referencia', () => {
    expect(referenciaDeCiclo(UID, CICLO, 1)).toBe(referenciaDeCiclo(UID, CICLO, 1));
  });

  it('un reintento al día siguiente cambia la referencia, para que Wompi no lo rechace por repetida', () => {
    expect(referenciaDeCiclo(UID, CICLO, 2)).not.toBe(referenciaDeCiclo(UID, CICLO, 1));
  });

  it('el mes siguiente también cambia', () => {
    expect(referenciaDeCiclo(UID, CICLO + 30 * 86_400_000, 1)).not.toBe(referenciaDeCiclo(UID, CICLO, 1));
  });

  it('el webhook puede sacar el uid de cualquiera de las dos formas', () => {
    expect(uidDeReferencia(referenciaDeCiclo(UID, CICLO, 1))).toBe(UID);
    expect(uidDeReferencia(referenciaDeAlta(UID, Date.now()))).toBe(UID);
    expect(uidDeReferencia(`teleorientacion_monthly_${UID}_1793000000000`)).toBe(UID);
  });

  it('una referencia que no reconoce no apunta a ninguna cuenta', () => {
    expect(uidDeReferencia('otra_pasarela_573001234567_123')).toBeNull();
    expect(uidDeReferencia('cualquier_cosa_abc_1')).toBeNull();
    expect(uidDeReferencia('')).toBeNull();
    expect(uidDeReferencia(undefined)).toBeNull();
  });
});

describe('Reclamo del cobro en curso', () => {
  const ahora = 1_793_000_000_000;

  it('sin reclamo, se puede cobrar', () => {
    expect(reclamoVigente(undefined, ahora)).toBe(false);
    expect(reclamoVigente(null, ahora)).toBe(false);
  });

  it('con un reclamo reciente, nadie más cobra', () => {
    expect(reclamoVigente({ ciclo: ahora, desdeMs: ahora - 60_000 }, ahora)).toBe(true);
  });

  it('un reclamo abandonado vence y deja reintentar', () => {
    expect(reclamoVigente({ ciclo: ahora, desdeMs: ahora - RECLAMO_VENCE_EN_MS - 1 }, ahora)).toBe(false);
  });

  it('un reclamo con basura adentro no bloquea para siempre', () => {
    expect(reclamoVigente({ ciclo: ahora, desdeMs: 'ayer' as never }, ahora)).toBe(false);
  });
});
