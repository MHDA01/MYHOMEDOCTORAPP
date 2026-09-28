/**
 * Reglas puras del grupo familiar: parentescos, edades, fechas y la disposición
 * del familiograma. Sin acceso a Firebase, para usarlas igual en el servidor
 * (validación y normalización) que en el navegador (pantalla) y en las pruebas.
 */

export type SexoFamiliar = 'male' | 'female' | 'other';

/** Parentescos que se ofrecen al crear un integrante. "Titular" no está: es la cuenta. */
export const PARENTESCOS = [
  'Cónyuge / Pareja',
  'Hijo/a',
  'Padre',
  'Madre',
  'Hermano/a',
  'Abuelo/a',
  'Nieto/a',
  'Tío/a',
  'Primo/a',
  'Otro familiar',
] as const;

export const SEGURIDAD_SOCIAL: Record<string, { etiqueta: string; opciones: string[]; pideNombre: string[] }> = {
  colombia: {
    etiqueta: 'Seguridad social',
    opciones: ['No tengo', 'EPS contributiva', 'EPS subsidiada', 'Medicina prepagada'],
    pideNombre: ['EPS contributiva', 'EPS subsidiada', 'Medicina prepagada'],
  },
  argentina: {
    etiqueta: 'Obra social',
    opciones: ['No tengo', 'Obra Social Sindical', 'Obra Social de Dirección', 'PAMI', 'Medicina Prepaga'],
    pideNombre: ['PAMI', 'Medicina Prepaga'],
  },
  chile: {
    etiqueta: 'Previsión',
    opciones: ['Fonasa', 'Isapre', 'Particular'],
    pideNombre: ['Isapre'],
  },
};

/** Acepta 'm'/'f' (esquema del servidor) y 'male'/'female' (tipos de la app). */
export function normalizarSexo(valor: unknown): SexoFamiliar {
  const v = String(valor ?? '').trim().toLowerCase();
  if (v === 'm' || v === 'male' || v === 'masculino') return 'male';
  if (v === 'f' || v === 'female' || v === 'femenino') return 'female';
  return 'other';
}

/**
 * Deja la fecha de nacimiento como 'AAAA-MM-DD', sin hora. Con hora, una medianoche
 * en UTC se muestra como el día anterior en Colombia (UTC-5).
 * Devuelve null si no es una fecha real.
 */
export function normalizarFechaNacimiento(valor: unknown): string | null {
  if (valor instanceof Date) {
    return isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 10);
  }
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  const solaFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto);
  if (solaFecha) {
    const [, a, m, d] = solaFecha;
    const fecha = new Date(Date.UTC(Number(a), Number(m) - 1, Number(d)));
    const real = fecha.getUTCFullYear() === Number(a) && fecha.getUTCMonth() === Number(m) - 1 && fecha.getUTCDate() === Number(d);
    return real ? texto : null;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(texto)) {
    const fecha = new Date(texto);
    return isNaN(fecha.getTime()) ? null : texto.slice(0, 10);
  }
  return null;
}

function partesFecha(fecha: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Edad en años cumplidos a `hoy`; undefined si no hay fecha válida. */
export function calcularEdad(fechaNacimiento: string | undefined, hoy: Date = new Date()): number | undefined {
  const partes = fechaNacimiento ? partesFecha(fechaNacimiento) : null;
  if (!partes) return undefined;
  const [a, m, d] = partes;
  let edad = hoy.getFullYear() - a;
  const antesDelCumple = hoy.getMonth() + 1 < m || (hoy.getMonth() + 1 === m && hoy.getDate() < d);
  if (antesDelCumple) edad--;
  return Math.max(0, edad);
}

/** "Ana María" → "Ana María": ajusta solo cómo se muestra, no el dato guardado. */
export function nombrePropio(texto: string | undefined): string {
  if (!texto) return '';
  return texto
    .split(' ')
    .map((p) => (p ? p.charAt(0).toLocaleUpperCase('es-CO') + p.slice(1).toLocaleLowerCase('es-CO') : p))
    .join(' ');
}

/** Convierte "a, b,, c " en ["a", "b", "c"]. */
export function listaDesdeTexto(texto: string): string[] {
  return texto
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// Familiograma
// ─────────────────────────────────────────────────────────────

export type NivelGeneracion = -2 | -1 | 0 | 1 | 2 | 3;

export const ETIQUETA_NIVEL: Record<NivelGeneracion, string> = {
  [-2]: 'Abuelos',
  [-1]: 'Padres y tíos',
  0: 'Tu generación',
  1: 'Hijos',
  2: 'Nietos',
  3: 'Otros familiares',
};

type Rol = 'titular' | 'pareja' | 'padres' | 'abuelos' | 'tios' | 'hermanos' | 'primos' | 'hijos' | 'nietos' | 'otros';

/** Clasifica un parentesco escrito a mano o elegido de la lista. */
export function rolDeParentesco(parentesco: string | undefined, esTitular = false): Rol {
  if (esTitular) return 'titular';
  const p = (parentesco ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  if (/^titular$/.test(p)) return 'titular';
  if (/abuel/.test(p)) return 'abuelos';
  if (/biet|niet/.test(p)) return 'nietos';
  if (/conyuge|pareja|espos|compan|marido|mujer$/.test(p)) return 'pareja';
  if (/herman|cuna/.test(p)) return 'hermanos';
  if (/^(tio|tia)|\btio\b|\btia\b/.test(p)) return 'tios';
  if (/primo|prima/.test(p)) return 'primos';
  if (/hij|yerno|nuera/.test(p)) return 'hijos';
  if (/padre|madre|papa|mama|suegr|padrastro|madrastra/.test(p)) return 'padres';
  return 'otros';
}

export type PersonaFamiliograma<T> = { persona: T; rol: Rol };

export type GrupoFamiliograma<T> = {
  /** Personas unidas por una línea de pareja (o una sola persona). */
  personas: PersonaFamiliograma<T>[];
  esPareja: boolean;
};

export type FilaFamiliograma<T> = {
  nivel: NivelGeneracion;
  etiqueta: string;
  grupos: GrupoFamiliograma<T>[];
};

type Base = { firstName?: string; lastName?: string; relationship?: string; esTitular?: boolean; dateOfBirth?: string };

/**
 * Ordena a la familia por generaciones, de los mayores a los menores:
 * abuelos → padres y tíos → tu generación (tú y tu pareja, luego hermanos y primos) →
 * hijos → nietos → otros. Padre y madre quedan unidos como pareja, y tú con tu pareja.
 * Las personas de una misma fila van de mayor a menor edad.
 *
 * Solo se conoce el parentesco con el titular: no se sabe cuáles abuelos son de qué
 * lado ni de quién es cada hijo, así que las líneas unen generaciones, no personas.
 */
export function armarFamiliograma<T extends Base>(personas: T[], hoy: Date = new Date()): FilaFamiliograma<T>[] {
  const clasificadas: PersonaFamiliograma<T>[] = personas.map((persona) => ({
    persona,
    rol: rolDeParentesco(persona.relationship, Boolean(persona.esTitular)),
  }));

  const edad = (p: T) => calcularEdad(p.dateOfBirth, hoy) ?? -1;
  const nombre = (p: T) => `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim();
  const porEdad = (a: PersonaFamiliograma<T>, b: PersonaFamiliograma<T>) =>
    edad(b.persona) - edad(a.persona) || nombre(a.persona).localeCompare(nombre(b.persona), 'es');

  const filas = new Map<NivelGeneracion, GrupoFamiliograma<T>[]>();
  const agregar = (nivel: NivelGeneracion, grupo: GrupoFamiliograma<T>) => {
    filas.set(nivel, [...(filas.get(nivel) ?? []), grupo]);
  };
  const de = (...roles: Rol[]) => clasificadas.filter((c) => roles.includes(c.rol)).sort(porEdad);

  // El titular y su pareja forman el núcleo de la fila del medio.
  const nucleo = de('titular').concat(de('pareja'));
  if (nucleo.length) agregar(0, { personas: nucleo, esPareja: nucleo.length > 1 });

  const padres = de('padres');
  if (padres.length) agregar(-1, { personas: padres, esPareja: padres.length > 1 });
  de('tios').forEach((c) => agregar(-1, { personas: [c], esPareja: false }));

  de('abuelos').forEach((c) => agregar(-2, { personas: [c], esPareja: false }));
  de('hermanos', 'primos').forEach((c) => agregar(0, { personas: [c], esPareja: false }));
  de('hijos').forEach((c) => agregar(1, { personas: [c], esPareja: false }));
  de('nietos').forEach((c) => agregar(2, { personas: [c], esPareja: false }));
  de('otros').forEach((c) => agregar(3, { personas: [c], esPareja: false }));

  return ([-2, -1, 0, 1, 2, 3] as NivelGeneracion[])
    .filter((nivel) => filas.has(nivel))
    .map((nivel) => ({ nivel, etiqueta: ETIQUETA_NIVEL[nivel], grupos: filas.get(nivel)! }));
}
