import { describe, expect, it } from 'vitest';
import { VIGENCIA_ORIGEN_MS, diaBogota, fuenteDeParametros, normalizarFuente, origenVigente } from '@/lib/origen';

describe('normalizarFuente', () => {
  it('reconoce las redes aunque vengan con mayúsculas, dominio o abreviadas', () => {
    expect(normalizarFuente('tiktok')).toBe('tiktok');
    expect(normalizarFuente('TikTok')).toBe('tiktok');
    expect(normalizarFuente('tiktok.com')).toBe('tiktok');
    expect(normalizarFuente(' IG ')).toBe('instagram');
    expect(normalizarFuente('yt')).toBe('youtube');
    expect(normalizarFuente('WhatsApp')).toBe('whatsapp');
  });

  it('lo que no es una red conocida no se cuenta', () => {
    for (const valor of ['', 'google', 'correo', 'tiktok-falso-'.repeat(5), 42, null, undefined, { fuente: 'tiktok' }]) {
      expect(normalizarFuente(valor)).toBeNull();
    }
  });
});

describe('fuenteDeParametros', () => {
  it('usa utm_source y, si no está, origen', () => {
    expect(fuenteDeParametros(new URLSearchParams('utm_source=tiktok&utm_medium=bio'))).toBe('tiktok');
    expect(fuenteDeParametros(new URLSearchParams('origen=instagram'))).toBe('instagram');
    expect(fuenteDeParametros(new URLSearchParams('utm_source=google&origen=ig'))).toBe('instagram');
    expect(fuenteDeParametros(new URLSearchParams('q=fiebre'))).toBeNull();
  });
});

describe('origenVigente', () => {
  const ahora = Date.UTC(2026, 9, 7, 15);

  it('devuelve la red guardada mientras no hayan pasado 30 días', () => {
    const guardado = JSON.stringify({ fuente: 'tiktok', fecha: ahora - VIGENCIA_ORIGEN_MS + 1000 });
    expect(origenVigente(guardado, ahora)).toBe('tiktok');
  });

  it('vencido, dañado o ajeno no cuenta', () => {
    expect(origenVigente(JSON.stringify({ fuente: 'tiktok', fecha: ahora - VIGENCIA_ORIGEN_MS - 1 }), ahora)).toBeNull();
    expect(origenVigente('{no es json', ahora)).toBeNull();
    expect(origenVigente(JSON.stringify({ fuente: 'google', fecha: ahora }), ahora)).toBeNull();
    expect(origenVigente(JSON.stringify({ fuente: 'tiktok' }), ahora)).toBeNull();
    expect(origenVigente(null, ahora)).toBeNull();
  });
});

describe('diaBogota', () => {
  it('a las 11 p. m. de Bogotá sigue siendo el mismo día aunque en UTC ya sea el siguiente', () => {
    expect(diaBogota(Date.UTC(2026, 9, 8, 4, 0))).toBe('2026-10-07');
    expect(diaBogota(Date.UTC(2026, 9, 8, 5, 0))).toBe('2026-10-08');
  });
});
