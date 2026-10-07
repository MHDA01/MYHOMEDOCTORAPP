// ============================================================
// lib/origen.ts — De qué red social llega la gente (TikTok, Instagram...).
//
// Solo se cuentan totales por red y por día: nada queda unido a una persona.
// El enlace de cada red lleva ?utm_source=<red> (u ?origen=<red>); el navegador
// recuerda la última red por 30 días para atribuirle el registro si llega a crear
// la cuenta.
// ============================================================

export const FUENTES = ['tiktok', 'instagram', 'youtube', 'facebook', 'whatsapp'] as const;
export type Fuente = (typeof FUENTES)[number];

/** Parámetros de la dirección que traen la red; se quitan de la barra después de leerlos. */
export const PARAMETROS_ORIGEN = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'origen'] as const;

/** Totales por red: Metricas_Origen/{red}. Solo la escribe y la lee el servidor. */
export const COLECCION_ORIGEN = 'Metricas_Origen';

export const CLAVE_ORIGEN = 'mhda_origen';
export const CLAVE_VISITA = 'mhda_origen_visita';
export const VIGENCIA_ORIGEN_MS = 30 * 24 * 60 * 60 * 1000;

const ALIAS: Record<string, Fuente> = {
  tiktok: 'tiktok',
  tt: 'tiktok',
  instagram: 'instagram',
  ig: 'instagram',
  youtube: 'youtube',
  yt: 'youtube',
  facebook: 'facebook',
  fb: 'facebook',
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
};

/** "TikTok", "tiktok.com" o "tt" → "tiktok". Cualquier otra cosa → null (no se cuenta). */
export function normalizarFuente(valor: unknown): Fuente | null {
  if (typeof valor !== 'string' || valor.length > 40) return null;
  const limpio = valor.trim().toLowerCase().replace(/\.com$/, '').replace(/[^a-z]/g, '');
  return ALIAS[limpio] ?? null;
}

export function fuenteDeParametros(parametros: URLSearchParams): Fuente | null {
  return normalizarFuente(parametros.get('utm_source')) ?? normalizarFuente(parametros.get('origen'));
}

/** Lee lo que guardó el navegador; null si no hay, está dañado o ya venció. */
export function origenVigente(guardado: string | null, ahora: number): Fuente | null {
  if (!guardado) return null;
  try {
    const { fuente, fecha } = JSON.parse(guardado) as { fuente?: unknown; fecha?: unknown };
    const valida = normalizarFuente(fuente);
    if (!valida || typeof fecha !== 'number' || ahora - fecha > VIGENCIA_ORIGEN_MS) return null;
    return valida;
  } catch {
    return null;
  }
}

// Bogotá no tiene horario de verano: UTC-5 todo el año.
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
export function diaBogota(ms: number): string {
  return new Date(ms - OFFSET_BOGOTA_MS).toISOString().slice(0, 10);
}
