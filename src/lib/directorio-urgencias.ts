/**
 * A quién llama y a dónde va una persona en Colombia cuando algo es una urgencia.
 *
 * Tres reglas que no se negocian, porque esta es la única pantalla de la app a la
 * que alguien llega *durante* una emergencia:
 *
 * 1. **El 123 no depende de nada.** No de la EPS, no de la ciudad, no de que
 *    hayamos verificado algo. Es la línea única nacional de emergencias y se
 *    muestra siempre, primero y sin condiciones.
 * 2. **Ningún dato de un tercero sin fuente y sin fecha.** Cada fila trae la URL
 *    de donde salió y el día en que se leyó. Sin las dos cosas, la fila no existe.
 *    Esta pantalla ya tuvo durante meses el SAMU 131 y cuatro prestadores de
 *    Chile presentados como "nuestros proveedores": así se ve el costo de un dato
 *    sin procedencia.
 * 3. **Los datos caducan.** Pasados `DIAS_DE_VIGENCIA` días sin reverificar, la
 *    fila deja de mostrarse y la persona ve el camino seguro (el 123 y su carné).
 *    Un teléfono viejo hace perder minutos; una sede cerrada manda a alguien a una
 *    puerta cerrada. Es mejor no decir nada que decir algo de hace dos años.
 *
 * Y una cuarta, de la casa: todo esto es texto visible en una emergencia, así que
 * **lo aprueba Alexander**. Mientras `APROBADO_POR_EL_FUNDADOR` sea `false`, la
 * pantalla no muestra un solo teléfono de tercero: muestra el 123 y el carné.
 */

import { epsPorId } from './eps-colombia';

/** Línea única nacional de emergencias en Colombia. No es un dato configurable. */
export const LINEA_EMERGENCIAS = '123';

/**
 * El interruptor. En `false` la pantalla se comporta como si el directorio
 * estuviera vacío: 123 y carné. Lo enciende Alexander cuando haya revisado,
 * número por número, lo que hay en `LINEAS_POR_EPS` y en `SEDES_DE_URGENCIAS`.
 */
export const APROBADO_POR_EL_FUNDADOR = false;

/** Cuánto vale una verificación antes de volverse sospechosa. */
export const DIAS_DE_VIGENCIA = 180;

export type Fuente = {
  /** Página de donde salió el dato. Preferiblemente la de la propia EPS. */
  url: string;
  /** Día en que alguien abrió esa página y leyó este dato. 'AAAA-MM-DD'. */
  verificado: string;
  /** Quién lo verificó, para poder volver a preguntarle. */
  por: string;
};

export type Telefono = {
  /** Qué es esta línea: 'Nacional', 'Bogotá', 'Medellín'… */
  etiqueta: string;
  /** Tal como se marca, con indicativo. */
  numero: string;
  /** Lo que la fuente dice del horario. Si la fuente no lo dice, no se inventa. */
  horario?: string;
};

export type LineaEps = {
  epsId: string;
  telefonos: readonly Telefono[];
  /** Página oficial de la EPS donde la persona puede confirmar por su cuenta. */
  paginaOficial?: string;
  fuente: Fuente;
};

export type SedeUrgencias = {
  epsId: string;
  municipioId: string;
  nombre: string;
  direccion: string;
  telefono?: string;
  fuente: Fuente;
};

/**
 * Las líneas de atención, EPS por EPS.
 *
 * ESTADO AL 11-NOV-2026: **una sola EPS verificada de 28.** No es descuido, es lo
 * que se pudo hacer sin inventar nada, y queda escrito para que nadie crea que el
 * directorio está completo:
 *
 * - `nuevaeps.com.co` responde **HTTP 403** a una lectura automática.
 * - `epssanitas.com` está detrás de un muro antibots (Radware) y redirige.
 * - Las búsquedas en la web devuelven números de medios y de sitios de terceros
 *   que **se contradicen entre sí** y arrastran números de la pandemia. Ninguno
 *   de esos entró aquí.
 *
 * Lo que falta no lo puede llenar una automatización: sale del carné de cada
 * persona o de que alguien abra la página de cada EPS y lo lea. Mientras una EPS
 * no esté aquí, su afiliado ve el 123 y su carné, que es la verdad.
 */
export const LINEAS_POR_EPS: readonly LineaEps[] = [
  {
    epsId: 'sura',
    telefonos: [
      { etiqueta: 'Medellín', numero: '+57 604 448 6115' },
      { etiqueta: 'Bogotá', numero: '+57 601 489 7941' },
      { etiqueta: 'Resto del país', numero: '01 8000 519 519' },
    ],
    paginaOficial: 'https://www.epssura.com/',
    fuente: {
      url: 'https://www.epssura.com/',
      verificado: '2026-11-11',
      por: 'Claude, leyendo la página de inicio de EPS Sura',
    },
    // La página traía además una línea de emergencia por un sismo
    // (018000 415215). NO se incluye: es un número de coyuntura, publicado para
    // un hecho concreto, y un teléfono temporal metido en una pantalla de
    // urgencias es un teléfono muerto en tres semanas.
  },
];

/**
 * Las sedes de urgencias por ciudad.
 *
 * ESTÁ VACÍO A PROPÓSITO, y conviene leer por qué antes de llenarlo: una sede es
 * el dato más peligroso de esta pantalla. Un teléfono equivocado hace perder una
 * llamada; una dirección equivocada manda a una persona en urgencia a una puerta
 * cerrada, y eso ya no se arregla con un despliegue.
 *
 * Para que una fila entre aquí hacen falta tres cosas, y ninguna la puede dar una
 * búsqueda en la web: la red de prestadores de esa EPS en esa ciudad, publicada
 * por la EPS; la fecha en que se leyó; y un responsable que la reverifique cada
 * `DIAS_DE_VIGENCIA` días. Sin el tercero, la lista se convierte en lo que ya
 * tuvimos: un directorio viejo con cara de directorio bueno.
 */
export const SEDES_DE_URGENCIAS: readonly SedeUrgencias[] = [];

/** Días enteros entre dos fechas 'AAAA-MM-DD'. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00.000Z`);
  const b = Date.parse(`${hasta}T00:00:00.000Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.floor((b - a) / 86_400_000);
}

/**
 * ¿Esta fuente sigue sirviendo hoy? Una fecha ilegible o futura cuenta como no
 * vigente: ante la duda, la pantalla calla y manda al 123.
 */
export function fuenteVigente(fuente: Fuente, hoy: string): boolean {
  const dias = diasEntre(fuente.verificado, hoy);
  if (!Number.isFinite(dias)) return false;
  if (dias < 0) return false;
  return dias <= DIAS_DE_VIGENCIA;
}

export type UrgenciasParaLaPersona = {
  /** Siempre el 123. */
  lineaEmergencias: string;
  /** El nombre de la EPS, si la ficha lo tiene y está en la lista. */
  eps: string | null;
  /** Lo que la persona escribió, cuando su EPS no está en la lista. */
  epsDeclarada: string | null;
  telefonos: readonly Telefono[];
  paginaOficial: string | null;
  sedes: readonly SedeUrgencias[];
  /**
   * Por qué no hay datos de la EPS. La pantalla lo usa para decir la verdad en
   * vez de mostrar un hueco:
   * - 'sin_aprobar': hay datos, pero nadie los ha aprobado todavía.
   * - 'sin_eps': la ficha no dice de qué EPS es.
   * - 'eps_sin_datos': sabemos la EPS y no tenemos su línea.
   * - 'datos_vencidos': los teníamos y caducaron.
   * - null: hay datos y se muestran.
   */
  motivo: 'sin_aprobar' | 'sin_eps' | 'eps_sin_datos' | 'datos_vencidos' | null;
};

/**
 * Qué se le puede decir hoy a esta persona. Función pura: entra lo que la ficha
 * sabe, sale lo que la pantalla puede mostrar. No llama a nada ni adivina nada.
 */
export function urgenciasPara(
  datos: { epsId?: string; epsDeclarada?: string; municipioId?: string },
  hoy: string
): UrgenciasParaLaPersona {
  const eps = epsPorId(datos.epsId);
  const base: UrgenciasParaLaPersona = {
    lineaEmergencias: LINEA_EMERGENCIAS,
    eps: eps?.nombre ?? null,
    epsDeclarada: eps ? null : datos.epsDeclarada?.trim() || null,
    telefonos: [],
    paginaOficial: null,
    sedes: [],
    motivo: null,
  };

  if (!APROBADO_POR_EL_FUNDADOR) return { ...base, motivo: 'sin_aprobar' };
  if (!eps) return { ...base, motivo: 'sin_eps' };

  const linea = LINEAS_POR_EPS.find((l) => l.epsId === eps.id);
  const sedes = datos.municipioId
    ? SEDES_DE_URGENCIAS.filter((s) => s.epsId === eps.id && s.municipioId === datos.municipioId)
    : [];

  const lineaVigente = linea && fuenteVigente(linea.fuente, hoy) ? linea : null;
  const sedesVigentes = sedes.filter((s) => fuenteVigente(s.fuente, hoy));

  if (!linea && sedes.length === 0) return { ...base, motivo: 'eps_sin_datos' };
  if (!lineaVigente && sedesVigentes.length === 0) return { ...base, motivo: 'datos_vencidos' };

  return {
    ...base,
    telefonos: lineaVigente?.telefonos ?? [],
    paginaOficial: lineaVigente?.paginaOficial ?? null,
    sedes: sedesVigentes,
    motivo: null,
  };
}

/** Hoy en Bogotá como 'AAAA-MM-DD'. La vigencia se mide en días locales. */
export function hoyEnBogota(ahora: Date = new Date()): string {
  const bogota = new Date(ahora.getTime() - 5 * 60 * 60 * 1000);
  return bogota.toISOString().slice(0, 10);
}
