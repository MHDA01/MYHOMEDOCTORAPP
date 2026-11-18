/**
 * El comprobante de cada cobro: qué dice el correo, cómo se ve el pago en «Mi cuenta»
 * y que enviarlo nunca rompe un cobro que ya ocurrió.
 */
import { describe, expect, it } from 'vitest';
import { comprobanteDePago, URL_MI_CUENTA } from '../../functions/src/correos-cobro';
import { enviarComprobante } from '../../functions/src/comprobante';
import { etiquetaDePago, pagoPendienteDemasiado, pesosCop } from '../../src/lib/pagos';

const base = {
  valorCop: 34_900,
  fecha: new Date('2026-12-13T15:30:00Z'), // 10:30 a. m. en Bogotá
  referencia: 'teleorientacion_recurring_abc123_1793000000000_1',
  idWompi: '12345-1793000000-99999',
  concepto: 'Plan Familias Fundadoras, renovación mensual',
  consultas: 100,
  proximoCobro: new Date('2027-01-12T15:00:00Z'),
};

describe('Correo de comprobante', () => {
  it('trae valor, concepto, fecha en hora de Bogotá, referencia y transacción de Wompi', () => {
    const c = comprobanteDePago(base);
    expect(c.asunto).toBe('Comprobante de pago: $34.900 COP');
    expect(c.html).toContain('$34.900 COP');
    expect(c.html).toContain('Plan Familias Fundadoras, renovación mensual');
    expect(c.html).toContain('13 de diciembre de 2026');
    expect(c.html).toMatch(/10:30/);
    expect(c.html).toContain(base.referencia);
    expect(c.html).toContain(base.idWompi);
    expect(c.html).toContain('100');
  });

  it('dice cuándo es el próximo cobro y enlaza a Mi cuenta', () => {
    const c = comprobanteDePago(base);
    expect(c.html).toContain('12 de enero de 2027');
    expect(c.html).toContain(`href="${URL_MI_CUENTA}"`);
  });

  it('sin próximo cobro (renovación apagada) no inventa uno', () => {
    for (const proximoCobro of [null, undefined, new Date('no es una fecha')]) {
      expect(comprobanteDePago({ ...base, proximoCobro }).html).not.toContain('próximo cobro');
    }
  });

  it('sin id de Wompi ni consultas, esas líneas no salen', () => {
    const c = comprobanteDePago({ ...base, idWompi: null, consultas: null });
    expect(c.html).not.toContain('Transacción en Wompi');
    expect(c.html).not.toContain('Consultas incluidas');
  });

  it('escapa el HTML de lo que viene de fuera', () => {
    const c = comprobanteDePago({ ...base, referencia: 'x<script>alert(1)</script>', concepto: 'A & B' });
    expect(c.html).not.toContain('<script>');
    expect(c.html).toContain('x&lt;script&gt;');
    expect(c.html).toContain('A &amp; B');
  });
});

describe('Enviar el comprobante nunca rompe el cobro', () => {
  const datos = { valorCop: 34_900, referencia: 'r1', concepto: 'Plan' };

  it('si la cuenta no tiene correo, no lanza', async () => {
    const db: any = { collection: () => ({ doc: () => ({ get: async () => ({ data: () => ({}) }) }) }) };
    await expect(enviarComprobante(db, 'uid', datos)).resolves.toBeUndefined();
  });

  it('si Firestore falla, no lanza', async () => {
    const db: any = {
      collection: () => ({
        doc: () => ({
          get: async () => {
            throw new Error('Firestore caído');
          },
        }),
      }),
    };
    await expect(enviarComprobante(db, 'uid', datos)).resolves.toBeUndefined();
  });
});

describe('Pagos en «Mi cuenta»', () => {
  it('cada estado tiene su etiqueta y uno desconocido no se disfraza', () => {
    expect(etiquetaDePago('success')).toBe('Aprobado');
    expect(etiquetaDePago('pending')).toBe('En confirmación');
    expect(etiquetaDePago('failed')).toBe('Rechazado');
    expect(etiquetaDePago('cancelled')).toBe('Cancelado');
    expect(etiquetaDePago('raro')).toBe('Sin estado');
    expect(etiquetaDePago(undefined)).toBe('Sin estado');
  });

  it('los pesos salen con punto de miles', () => {
    expect(pesosCop(34_900)).toBe('$34.900');
  });

  it('un pago pendiente solo alerta pasadas 24 horas', () => {
    const ahora = new Date('2026-12-14T12:00:00Z');
    const hace = (h: number) => new Date(ahora.getTime() - h * 3_600_000);
    expect(pagoPendienteDemasiado('pending', hace(2), ahora)).toBe(false);
    expect(pagoPendienteDemasiado('pending', hace(24), ahora)).toBe(true);
    expect(pagoPendienteDemasiado('pending', hace(60), ahora)).toBe(true);
    expect(pagoPendienteDemasiado('success', hace(60), ahora)).toBe(false);
    expect(pagoPendienteDemasiado('pending', null, ahora)).toBe(false);
  });
});
