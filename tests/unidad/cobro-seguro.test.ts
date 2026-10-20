/**
 * Paso 5 de la auditoría: lo que evita cobrar dos veces y lo que evita que
 * cualquiera haga hablar al agente de ventas.
 *
 * Estas dos piezas viven en `functions/` (despliegue aparte) pero no dependen
 * de Firebase, así que se prueban desde aquí.
 */
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  RECLAMO_VENCE_EN_MS,
  referenciaDeAlta,
  referenciaDeCiclo,
  reclamoVigente,
  uidDeReferencia,
} from '../../functions/src/cobro-idempotente';
import { firmaMetaValida } from '../../functions/src/sales-agent/firma-meta';

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
    expect(uidDeReferencia('lead_whatsapp_573001234567_123')).toBeNull();
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

describe('Firma de Meta en los webhooks', () => {
  const SECRETO = 'secreto-de-la-app-de-meta';
  const cuerpo = Buffer.from(JSON.stringify({ entry: [{ changes: [] }] }), 'utf8');
  const firmar = (c: Buffer | string, secreto = SECRETO) =>
    `sha256=${createHmac('sha256', secreto).update(c).digest('hex')}`;

  it('acepta un evento firmado por Meta', () => {
    expect(firmaMetaValida(cuerpo, firmar(cuerpo), SECRETO)).toBe(true);
  });

  it('acepta el cuerpo como texto, no solo como Buffer', () => {
    const texto = 'hola';
    expect(firmaMetaValida(texto, firmar(texto), SECRETO)).toBe(true);
  });

  it('rechaza un cuerpo cambiado aunque traiga una firma válida de otro cuerpo', () => {
    const otro = Buffer.from('{"entry":[{"changes":[{"malicioso":true}]}]}', 'utf8');
    expect(firmaMetaValida(otro, firmar(cuerpo), SECRETO)).toBe(false);
  });

  it('rechaza una firma hecha con otro secreto', () => {
    expect(firmaMetaValida(cuerpo, firmar(cuerpo, 'secreto-equivocado'), SECRETO)).toBe(false);
  });

  it('falla cerrado si falta el App Secret', () => {
    expect(firmaMetaValida(cuerpo, firmar(cuerpo), undefined)).toBe(false);
    expect(firmaMetaValida(cuerpo, firmar(cuerpo), '')).toBe(false);
  });

  it('rechaza cabeceras mal formadas sin reventar', () => {
    for (const cabecera of [undefined, null, '', 'sha256=', 'sha1=abc', 'abc', 'sha256=zz', 42, {}]) {
      expect(firmaMetaValida(cuerpo, cabecera, SECRETO)).toBe(false);
    }
  });

  it('rechaza cuando no hay cuerpo que firmar', () => {
    expect(firmaMetaValida(undefined, firmar(cuerpo), SECRETO)).toBe(false);
    expect(firmaMetaValida(null, firmar(cuerpo), SECRETO)).toBe(false);
  });
});
