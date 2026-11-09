/**
 * El arnés de casos: cómo se mide el grafo sin gastar un peso en el modelo.
 *
 * Tercera pieza del paso 3 (`protocolos/grafo-de-decision.md`, §12). Un grafo
 * es determinista, así que doscientos casos escritos pasan por el ejecutor en
 * milisegundos y dan siempre lo mismo. Eso mueve la medición de los falsos
 * negativos de una corrida contra Gemini a `npm test`.
 *
 * **Cada caso declara una banda, no un valor.** Sale del desenlace del caso de
 * prueba del 28-oct-2026: el médico responsable escogió `consulta_general` y
 * añadió que `consulta_prioritaria` "no me disgusta, estaría bien para ser más
 * precavidos". Con un valor único, ese caso habría contado como fallo y
 * habríamos ajustado el grafo para pasar la prueba en vez de para acertar.
 *
 * Y la métrica distingue tres cosas que no se pueden sumar:
 *
 * | Resultado | Qué es | Cómo se cuenta |
 * |---|---|---|
 * | Por debajo de la banda | **Falso negativo** | El fallo grave. Cuenta aparte y no se promedia |
 * | Dentro de la banda | Correcto | — |
 * | Por encima de la banda | **Derivación innecesaria** | No es fallo de seguridad, pero cuesta, y se mide |
 *
 * Mezclar las tres en un solo porcentaje de acierto esconde justo la que
 * importa: un grafo con 95 % de acierto y los fallos del lado del falso
 * negativo es peor que uno con 85 % que yerra por precavido.
 */

import { type NivelAtencion, gravedad } from './resumen-consulta';
import { type BaseDeReglas } from './grafo-reglas';
import { type EstadoConsulta, type ResultadoTurno, evaluarTurno } from './grafo-ejecutor';

export interface CasoDelArnes {
  id: string;
  /** El caso en una línea, para leer el informe de fallos sin abrir el código. */
  resumen: string;
  estado: EstadoConsulta;
  /** El nivel que el médico responsable escogió. */
  nivelRecomendado: NivelAtencion;
  /**
   * Los niveles que también le parecen bien. Incluye al recomendado; si se
   * omite, la banda es solo el recomendado.
   */
  bandaAceptable?: readonly NivelAtencion[];
  /** Quién fijó el desenlace esperado y cuándo. El expediente lo necesita. */
  fijadoPor?: { medico: string; fecha: string };
  /** Alarmas que este caso tiene que disparar, por id. */
  alarmasEsperadas?: readonly string[];
}

export const VEREDICTOS = ['falso_negativo', 'correcto', 'derivacion_innecesaria'] as const;
export type Veredicto = (typeof VEREDICTOS)[number];

export interface ResultadoCaso {
  caso: CasoDelArnes;
  /** El piso que fijó el ejecutor. Es lo que se compara con la banda. */
  obtenido: NivelAtencion;
  veredicto: Veredicto;
  /** Alarmas esperadas que no se dispararon. Cualquiera es un falso negativo. */
  alarmasPerdidas: string[];
  /** Alarmas que se dispararon sin estar esperadas. */
  alarmasDeMas: string[];
  turno: ResultadoTurno;
}

export interface Metrica {
  total: number;
  /** El fallo grave. Se cuenta aparte a propósito. */
  falsosNegativos: number;
  correctos: number;
  derivacionesInnecesarias: number;
  /** Los casos que fallaron por debajo, con nombre. Para arreglarlos, no para contarlos. */
  casosConFalsoNegativo: string[];
}

/** La banda de un caso, con el recomendado dentro siempre. */
export function banda(caso: CasoDelArnes): NivelAtencion[] {
  const declarada = caso.bandaAceptable ?? [];
  return [...new Set([caso.nivelRecomendado, ...declarada])];
}

/**
 * Compara un nivel obtenido contra la banda del caso.
 *
 * Por debajo del más bajo de la banda es falso negativo; por encima del más
 * alto, derivación innecesaria; dentro, correcto. Un nivel que no está en la
 * banda pero cae entre su mínimo y su máximo cuenta como correcto: la banda es
 * un rango, no una lista de valores permitidos.
 */
export function veredicto(obtenido: NivelAtencion, caso: CasoDelArnes): Veredicto {
  const niveles = banda(caso).map(gravedad);
  const minimo = Math.min(...niveles);
  const maximo = Math.max(...niveles);
  const g = gravedad(obtenido);
  if (g < minimo) return 'falso_negativo';
  if (g > maximo) return 'derivacion_innecesaria';
  return 'correcto';
}

/** Corre un caso por el ejecutor y lo juzga. */
export function correrCaso(caso: CasoDelArnes, base: BaseDeReglas): ResultadoCaso {
  const turno = evaluarTurno(caso.estado, base);
  const disparadas = turno.alarmas.map((a) => a.alarma.id);
  const esperadas = caso.alarmasEsperadas ?? [];

  const alarmasPerdidas = esperadas.filter((id) => !disparadas.includes(id));
  const alarmasDeMas = disparadas.filter((id) => !esperadas.includes(id));

  // Una alarma esperada que no se dispara es un falso negativo, aunque el piso
  // haya quedado donde debía por otro camino. El piso correcto por casualidad
  // no es seguridad: la próxima vez que cambie una regla se cae.
  const porNivel = veredicto(turno.piso, caso);
  return {
    caso,
    obtenido: turno.piso,
    veredicto: alarmasPerdidas.length ? 'falso_negativo' : porNivel,
    alarmasPerdidas,
    alarmasDeMas,
    turno,
  };
}

export function correrArnes(casos: readonly CasoDelArnes[], base: BaseDeReglas): ResultadoCaso[] {
  return casos.map((c) => correrCaso(c, base));
}

export function medir(resultados: readonly ResultadoCaso[]): Metrica {
  const de = (v: Veredicto) => resultados.filter((r) => r.veredicto === v);
  return {
    total: resultados.length,
    falsosNegativos: de('falso_negativo').length,
    correctos: de('correcto').length,
    derivacionesInnecesarias: de('derivacion_innecesaria').length,
    casosConFalsoNegativo: de('falso_negativo').map((r) => r.caso.id),
  };
}

/**
 * El informe de una corrida, en texto, para leerlo en la consola de `npm test`
 * o pegarlo en el expediente de validación.
 *
 * No hay un "porcentaje de acierto" a propósito: las tres cifras van separadas
 * porque no son la misma clase de error.
 */
export function informeDeLaCorrida(m: Metrica): string {
  const lineas = [
    `Casos: ${m.total}`,
    `Falsos negativos: ${m.falsosNegativos}`,
    `Correctos: ${m.correctos}`,
    `Derivaciones innecesarias: ${m.derivacionesInnecesarias}`,
  ];
  if (m.casosConFalsoNegativo.length) {
    lineas.push(`Por debajo de la banda: ${m.casosConFalsoNegativo.join(', ')}`);
  }
  return lineas.join('\n');
}
