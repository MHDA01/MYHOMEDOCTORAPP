/**
 * El lenguaje de reglas del grafo, y el revisor de la base de reglas.
 *
 * Primera mitad del paso 3 (`protocolos/grafo-de-decision.md`, §§4–6). El
 * ejecutor (`grafo-ejecutor.ts`) solo sabe recorrer; lo que hay que recorrer se
 * escribe con los tipos de aquí.
 *
 * **Las reglas son datos, no funciones.** Podrían ser predicados de TypeScript
 * y sería más corto, pero entonces un activador no se podría guardar en
 * Firestore, ni mostrar en Administración → Protocolos, ni aprobar uno por uno.
 * El diseño dice que **el activador es la unidad de aprobación** y que se revisa
 * en medio minuto: para eso tiene que ser legible sin leer código.
 *
 * Tres invariantes del diseño que aquí son estructurales, no un recordatorio:
 *
 * 1. **Un hueco nunca satisface una condición.** La evaluación es de tres
 *    valores —`si`, `no`, `falta`— y nada se dispara con `falta`. Si fuera
 *    booleana, "no consta fiebre" y "no tiene fiebre" valdrían lo mismo, que es
 *    el error que `hallazgos.ts` existe para impedir.
 * 2. **Lo que falta es lo que se pregunta.** `faltantes()` saca de una condición
 *    los hallazgos que la dejaron en `falta`, y esa es la cola de preguntas del
 *    ejecutor. No hay que escribir las preguntas dos veces.
 * 3. **Una alarma no puede exigir un antecedente.** `revisarBase()` rechaza una
 *    alarma cuya condición mire la temporalidad `antecedente`, y el ejecutor
 *    solo le pasa los hallazgos de hoy. Si un antecedente negado pudiera apagar
 *    una alarma, bastaría un "yo no tengo nada" para desactivar una señal de
 *    peligro.
 */

import {
  type HallazgoRegistrado,
  type Temporalidad,
  type ValorHallazgo,
  definicion,
} from './hallazgos';
import { esFechaValida } from './ficha';
import { type NivelAtencion, type Severidad, NIVELES, SEVERIDADES } from './resumen-consulta';

// ─────────────────────────────────────────────────────────────
// Condiciones: tres valores, nunca dos
// ─────────────────────────────────────────────────────────────

export const VERDADES = ['si', 'no', 'falta'] as const;
export type Verdad = (typeof VERDADES)[number];

export type Condicion =
  /** `presente`: la persona lo afirma. `negado`: lo niega. `conocido`: se sabe, en un sentido u otro. */
  | { op: 'presente' | 'negado' | 'conocido'; hallazgo: string; temporalidad?: Temporalidad }
  | { op: '>=' | '<=' | '>' | '<'; hallazgo: string; valor: number; temporalidad?: Temporalidad }
  | { op: '=='; hallazgo: string; valor: ValorHallazgo; temporalidad?: Temporalidad }
  | { op: 'en'; hallazgo: string; valores: readonly ValorHallazgo[]; temporalidad?: Temporalidad }
  | { op: 'todas' | 'alguna'; de: readonly Condicion[] }
  | { op: 'alMenos'; n: number; de: readonly Condicion[] };

/** Las condiciones hoja, las que de verdad miran un hallazgo. */
export type HojaCondicion = Extract<Condicion, { hallazgo: string }>;
/** Las que combinan otras condiciones. */
export type CondicionCompuesta = Extract<Condicion, { de: readonly Condicion[] }>;

export function esCompuesta(cond: Condicion): cond is CondicionCompuesta {
  return cond.op === 'todas' || cond.op === 'alguna' || cond.op === 'alMenos';
}

function buscar(
  hallazgos: readonly HallazgoRegistrado[],
  id: string,
  temporalidad?: Temporalidad
): HallazgoRegistrado | undefined {
  if (temporalidad) return hallazgos.find((h) => h.id === id && h.temporalidad === temporalidad);
  // Sin temporalidad declarada manda lo de hoy: "hoy tiene 39" pesa más que
  // "es diabético" cuando la condición no dice cuál quiere.
  return (
    hallazgos.find((h) => h.id === id && h.temporalidad === 'actual') ??
    hallazgos.find((h) => h.id === id)
  );
}

/**
 * Evalúa una condición contra un conjunto de hallazgos.
 *
 * Devuelve `falta` cuando el dato no está, cuando la persona dijo que no lo
 * sabe, y cuando el hallazgo quedó `ambiguo`: un calificativo que admite dos
 * lecturas no decide conducta hasta que se aclare.
 */
export function evaluar(cond: Condicion, hallazgos: readonly HallazgoRegistrado[]): Verdad {
  if (esCompuesta(cond)) {
    const partes = cond.de.map((c) => evaluar(c, hallazgos));
    const si = partes.filter((p) => p === 'si').length;
    const no = partes.filter((p) => p === 'no').length;
    switch (cond.op) {
      case 'alMenos':
        // Se cumple con n, y es imposible si ni contando los huecos se llega.
        if (si >= cond.n) return 'si';
        return si + (partes.length - si - no) >= cond.n ? 'falta' : 'no';
      case 'todas':
        if (no > 0) return 'no';
        return si === partes.length ? 'si' : 'falta';
      case 'alguna':
        if (si > 0) return 'si';
        return no === partes.length ? 'no' : 'falta';
    }
  }

  const h = buscar(hallazgos, cond.hallazgo, cond.temporalidad);
  if (!h || h.estado === 'no_preguntado' || h.ambiguo) return 'falta';

  switch (cond.op) {
    case 'conocido':
      // `no` quiere decir "se preguntó y la persona no lo sabe".
      return h.estado === 'positivo' || h.estado === 'negado' ? 'si' : 'no';
    case 'negado':
      if (h.estado === 'negado') return 'si';
      return h.estado === 'positivo' ? 'no' : 'falta';
    case 'presente':
      if (h.estado === 'positivo') return 'si';
      return h.estado === 'negado' ? 'no' : 'falta';
  }

  // Comparaciones: exigen un valor. Un negado es un "no"; un positivo sin valor
  // es un hueco (se sabe que lo tiene, no cuánto).
  if (h.estado === 'negado') return 'no';
  if (h.estado !== 'positivo' || h.valor === undefined) return 'falta';

  switch (cond.op) {
    case '==':
      return h.valor === cond.valor ? 'si' : 'no';
    case 'en':
      return cond.valores.includes(h.valor) ? 'si' : 'no';
  }

  if (typeof h.valor !== 'number') return 'falta';
  const v = h.valor;
  const cumple =
    cond.op === '>=' ? v >= cond.valor
    : cond.op === '<=' ? v <= cond.valor
    : cond.op === '>' ? v > cond.valor
    : v < cond.valor;
  return cumple ? 'si' : 'no';
}

/**
 * Los hallazgos que dejaron la condición en `falta`, en el orden en que están
 * escritos. Esta es la cola de preguntas: una regla declara qué mira y el
 * ejecutor deduce qué preguntar, sin que nadie escriba la lista dos veces.
 */
export function faltantes(cond: Condicion, hallazgos: readonly HallazgoRegistrado[]): string[] {
  if (esCompuesta(cond)) {
    // Una condición ya resuelta no pide nada: si un `alguna` ya se cumplió, no
    // hay que seguir preguntando por sus otras ramas.
    if (evaluar(cond, hallazgos) !== 'falta') return [];
    return [...new Set(cond.de.flatMap((c) => faltantes(c, hallazgos)))];
  }
  return evaluar(cond, hallazgos) === 'falta' ? [cond.hallazgo] : [];
}

/**
 * ¿Hay algo de lo que la persona ya dijo que apunte a esta condición?
 *
 * Es el **asidero** de una regla, y es lo que separa una regla que detecta de un
 * cuestionario. Sin esto, cada alarma y cada activador del catálogo pedirían su
 * dato en cada consulta: alguien que entra por una uña encarnada recibiría de
 * primeras la pregunta por ideación suicida, porque la alarma "no se puede
 * descartar". Con asidero, una regla solo pregunta cuando algo de hoy la hizo
 * pertinente — y las preguntas de tamizaje que sí hay que hacer siempre son
 * trabajo del árbol, que para eso existe.
 */
export function hayAsidero(cond: Condicion, hallazgos: readonly HallazgoRegistrado[]): boolean {
  return hojasDeLaCondicion(cond).some((hoja) => evaluar(hoja, hallazgos) === 'si');
}

/** Todos los hallazgos que una condición nombra, resuelta o no. Para el revisor. */
export function hallazgosDeLaCondicion(cond: Condicion): string[] {
  if (esCompuesta(cond)) {
    return [...new Set(cond.de.flatMap(hallazgosDeLaCondicion))];
  }
  return [cond.hallazgo];
}

/** Las hojas de una condición, para que el revisor pueda mirarlas una por una. */
export function hojasDeLaCondicion(cond: Condicion): HojaCondicion[] {
  if (esCompuesta(cond)) {
    return cond.de.flatMap(hojasDeLaCondicion);
  }
  return [cond];
}

/**
 * Lo único del pasado que una alarma puede mirar.
 *
 * Una alarma no exige antecedentes, pero sí hay umbrales que dependen de la
 * edad —la fiebre en el menor de tres meses es el ejemplo del médico
 * responsable, pregunta 6—. La frontera que importa no es "hoy contra ayer":
 * es que un antecedente **negable** pueda apagarla. La edad y el sexo no se
 * niegan; una gastritis sí, y la gente subnotifica.
 */
export const IDENTIFICACION: readonly string[] = ['edad_meses', 'sexo_registrado'];

// ─────────────────────────────────────────────────────────────
// Trazabilidad: ninguna regla entra sin fuente y sin firma
// ─────────────────────────────────────────────────────────────

export interface FuenteRegla {
  /** Documento: "GPC colombiana de neumonía adquirida en la comunidad". */
  documento: string
  pagina?: string;
  anio?: number;
  /** La calificación que le dio la guía de origen, literal. No la asigna la IA. */
  calificacionLiteral?: string;
}

export interface Aprobacion {
  /** El médico responsable, identificado. */
  medico: string;
  /** AAAA-MM-DD. */
  fecha: string;
}

export interface Trazable {
  fuente: FuenteRegla;
  aprobadoPor: Aprobacion;
}

// ─────────────────────────────────────────────────────────────
// Las cinco clases de regla
// ─────────────────────────────────────────────────────────────

/**
 * Corre en cada turno, por encima del grafo, y **no exige nada**. Un árbol sin
 * salida es una jaula: si alguien está contestando sobre su fiebre y de pronto
 * dice que no puede respirar, nada en curso tiene prioridad sobre eso.
 */
export interface Alarma extends Trazable {
  id: string;
  /** Lo que lee el médico. */
  nombreClinico: string;
  /** Solo sobre los hallazgos de hoy. El revisor rechaza mirar antecedentes. */
  cuando: Condicion;
  escalaA: NivelAtencion;
  severidad: Severidad;
}

/** Una explicación banal que se pregunta ANTES de nombrar lo raro (§5.1e). */
export interface ExplicacionComun {
  id: string;
  nombreClinico: string;
  /** Lo más frecuente primero, estratificado por sexo y curso de vida. */
  frecuencia: 'alta' | 'media' | 'baja';
  cuando: Condicion;
}

/** Instrumento o escala, con las variables que exige (§1.1). */
export interface Escala extends Trazable {
  id: string;
  nombreClinico: string;
  /** Si falta una, el puntaje no se calcula: se dice qué falta. */
  variables: readonly string[];
}

/**
 * Una condición sobre los hallazgos que levanta una sospecha, sin importar el
 * árbol en curso. `requisitos` evita el ruido: fiebre con molestia en el pecho,
 * sin ningún factor de riesgo, casi siempre es otra cosa.
 */
export interface Activador extends Trazable {
  id: string;
  /** El nombre clínico de la sospecha. Solo lo ve el médico. */
  sospecha: string;
  /** Compuerta sobre antecedentes. Compuerta la sospecha, nunca una alarma. */
  requisitos?: Condicion;
  disparadores: Condicion;
  prioridad: 'alta' | 'media' | 'baja';
  /**
   * Criterio declarado por el médico, no deducido del nivel: es el puesto 2 del
   * orden de prioridad de §7, por encima de todo lo que no sea una alarma.
   */
  amenazaVidaAguda?: boolean;
  /** Preguntas extra que la sospecha pide, más allá de sus disparadores. */
  preguntas?: readonly string[];
  /** El piso que fija, si lo fija. */
  nivelMinimo?: NivelAtencion;
  /** Lo común se pregunta antes que lo raro. Baja la sospecha; no la descarta. */
  explicacionesComunes?: readonly ExplicacionComun[];
  /** Escalas que esta sospecha querría calcular. */
  escalas?: readonly string[];
  /**
   * Disparadores relajados, para cuando una susceptibilidad predice una
   * presentación atípica (§5.1c): la ausencia de un signo típico no descarta la
   * sospecha. Queda declarado y aprobado, no implícito.
   */
  disparadoresRelajados?: Condicion;
}

/**
 * Criterios que juntos comprometen un órgano o un sistema. Fijan el **piso** del
 * nivel de atención **aunque la sospecha concreta esté equivocada**: una
 * sospecha puede fallar, el síndrome aguanta.
 */
export interface Sindrome extends Trazable {
  id: string;
  /** La palabra "síndrome" solo la ve el médico (decidido el 28-oct-2026). */
  nombreClinico: string;
  sistema: string;
  criterios: Condicion;
  piso: NivelAtencion;
  /**
   * Por qué hay que verlo, en lenguaje llano y sin rótulo. Texto clínico
   * visible: lo aprueba Alexander, y el revisor rechaza la palabra "síndrome".
   */
  explicacionLlana: string;
}

/** Lo que la ficha predice: sube probabilidades previas antes del primer síntoma. */
export interface Susceptibilidad extends Trazable {
  id: string;
  nombreClinico: string;
  /** Sobre antecedentes: EPOC, falla cardíaca, inmunosupresión. */
  cuando: Condicion;
  /** Activadores cuya prioridad sube. */
  eleva: readonly string[];
  /** Activadores cuyos disparadores se relajan por predecir atipia. */
  relaja?: readonly string[];
}

// ─────────────────────────────────────────────────────────────
// Árboles: deciden qué preguntar, no qué es verdad
// ─────────────────────────────────────────────────────────────

/** Lo que la persona se lleva. Dos caras, y no se mezclan. */
export interface Desenlace {
  nivel: NivelAtencion;
  /** Texto aprobado. Sin rótulos clínicos y sin la palabra "síndrome". */
  paraElPaciente: {
    /** La explicación más probable, en llano. Encaminar no es orientar. */
    explicacionProbable: string;
    /** Lo que no se resuelve desde aquí. Nunca "hazte un perfil renal". */
    noSeResuelveAqui: string;
    /** Qué hacer mientras llega la atención. Solo medidas 1A, 1B o 2A. */
    planDelIntervalo: readonly string[];
  };
  /** Lo que va al informe. Aquí sí se nombran síndromes y sospechas. */
  paraElMedico: {
    hipotesis: string;
    loQueQuedaSinValorar: readonly string[];
  };
  aprobadoPor: Aprobacion;
}

export interface Nodo {
  id: string;
  /** El hallazgo que este nodo llena. Ausente en un nodo terminal. */
  llena?: string;
  /**
   * El siguiente paso útil exige algo que Hilda no puede obtener —una medición,
   * un examen físico, un laboratorio, una imagen—. Es la parada por suficiencia
   * (§7): ahí se para y se nombra el vacío.
   */
  exigeInstrumento?: boolean;
  ramas?: readonly { cuando: Condicion; ir: string }[];
  desenlace?: Desenlace;
}

export interface Arbol {
  id: string;
  /** El motivo, en palabras del paciente. */
  motivo: string;
  raiz: string;
  nodos: readonly Nodo[];
  /**
   * Variables que este árbol **adelanta** sobre el orden canónico de §9.
   * Adelantar reordena; saltarse una variable no se puede.
   */
  adelanta?: readonly string[];
}

export interface BaseDeReglas {
  alarmas: readonly Alarma[];
  activadores: readonly Activador[];
  sindromes: readonly Sindrome[];
  susceptibilidades: readonly Susceptibilidad[];
  escalas: readonly Escala[];
  arboles: readonly Arbol[];
}

export const BASE_VACIA: BaseDeReglas = {
  alarmas: [],
  activadores: [],
  sindromes: [],
  susceptibilidades: [],
  escalas: [],
  arboles: [],
};

// ─────────────────────────────────────────────────────────────
// El revisor de la base
// ─────────────────────────────────────────────────────────────

/** Palabra prohibida en todo lo visible de esta app. */
const PROHIBIDAS_EN_TEXTO_VISIBLE = ['triage', 'triaje'];

/**
 * Revisa la base de reglas y devuelve los problemas. Lista vacía: la base está
 * bien formada.
 *
 * No juzga medicina —eso es del médico responsable— sino las reglas de la casa
 * y las invariantes del diseño que un ejecutor no puede comprobar en caliente:
 * que todo tenga fuente y firma, que ningún identificador apunte al vacío, que
 * una alarma no exija antecedentes, y que la palabra "síndrome" no llegue al
 * paciente. Está pensado para correr en `npm test` sobre la base real, y para
 * que el panel de Administración lo use antes de publicar.
 */
export function revisarBase(base: BaseDeReglas): string[] {
  const problemas: string[] = [];
  const di = (p: string) => problemas.push(p);

  const idsActivadores = new Set(base.activadores.map((a) => a.id));
  const idsEscalas = new Set(base.escalas.map((e) => e.id));

  const trazabilidad = (que: string, r: Trazable) => {
    if (!r.fuente?.documento?.trim()) di(`${que}: sin fuente documental`);
    if (!r.aprobadoPor?.medico?.trim()) di(`${que}: sin el médico que la aprobó`);
    if (!esFechaValida(r.aprobadoPor?.fecha ?? '')) di(`${que}: la fecha de aprobación no es AAAA-MM-DD`);
  };

  const vocabulario = (que: string, ids: readonly string[]) => {
    for (const id of ids) {
      const def = definicion(id);
      if (!def) {
        di(`${que}: "${id}" no está en el vocabulario de hallazgos`);
        continue;
      }
      // Una variable que el médico responsable todavía no aprobó se puede
      // nombrar y guardar, pero no puede decidir conducta. Hoy el caso es el
      // curso clínico, que no está entre las nueve variables del prompt.
      if (def.pendienteAprobacion) {
        di(`${que}: "${id}" está pendiente de aprobación del médico y no puede decidir conducta`);
      }
    }
  };

  const textoVisible = (que: string, texto: string) => {
    const bajo = texto.toLowerCase();
    for (const mala of PROHIBIDAS_EN_TEXTO_VISIBLE) {
      if (bajo.includes(mala)) di(`${que}: usa la palabra prohibida "${mala}" en texto visible`);
    }
    if (bajo.includes('síndrome') || bajo.includes('sindrome')) {
      di(`${que}: la palabra "síndrome" solo la ve el médico, no el paciente`);
    }
  };

  for (const a of base.alarmas) {
    const que = `alarma "${a.id}"`;
    trazabilidad(que, a);
    vocabulario(que, hallazgosDeLaCondicion(a.cuando));
    if (!NIVELES.includes(a.escalaA)) di(`${que}: "${a.escalaA}" no es un nivel de atención`);
    if (!SEVERIDADES.includes(a.severidad)) di(`${que}: "${a.severidad}" no es una severidad`);
    // Las dos invariantes del diseño sobre las alarmas, que el ejecutor no
    // puede comprobar en caliente porque ya sería tarde.
    for (const hoja of hojasDeLaCondicion(a.cuando)) {
      // Una negación solo puede callar, nunca disparar: si un "yo no tengo
      // nada" pudiera entrar en la condición, bastaría eso para desactivar una
      // señal de peligro.
      if (hoja.op === 'negado') {
        di(`${que}: se dispara con un antecedente negado, y un negado nunca enciende una alarma`);
      }
      if (hoja.temporalidad === 'antecedente' && !IDENTIFICACION.includes(hoja.hallazgo)) {
        di(
          `${que}: exige el antecedente "${hoja.hallazgo}", y una alarma no puede exigir nada ` +
            `(solo ${IDENTIFICACION.join(' y ')}, que no se niegan)`
        );
      }
    }
  }

  for (const s of base.sindromes) {
    const que = `síndrome "${s.id}"`;
    trazabilidad(que, s);
    vocabulario(que, hallazgosDeLaCondicion(s.criterios));
    if (!NIVELES.includes(s.piso)) di(`${que}: "${s.piso}" no es un nivel de atención`);
    if (!s.explicacionLlana?.trim()) di(`${que}: sin explicación en lenguaje llano para el paciente`);
    else textoVisible(`${que} (explicación llana)`, s.explicacionLlana);
  }

  for (const e of base.escalas) {
    const que = `escala "${e.id}"`;
    trazabilidad(que, e);
    vocabulario(que, e.variables);
    if (e.variables.length === 0) di(`${que}: sin variables requeridas`);
  }

  for (const a of base.activadores) {
    const que = `activador "${a.id}"`;
    trazabilidad(que, a);
    vocabulario(que, hallazgosDeLaCondicion(a.disparadores));
    if (a.requisitos) vocabulario(que, hallazgosDeLaCondicion(a.requisitos));
    if (a.disparadoresRelajados) vocabulario(que, hallazgosDeLaCondicion(a.disparadoresRelajados));
    if (a.preguntas) vocabulario(que, a.preguntas);
    if (a.nivelMinimo && !NIVELES.includes(a.nivelMinimo)) {
      di(`${que}: "${a.nivelMinimo}" no es un nivel de atención`);
    }
    for (const x of a.explicacionesComunes ?? []) {
      vocabulario(`${que}, explicación "${x.id}"`, hallazgosDeLaCondicion(x.cuando));
    }
    for (const id of a.escalas ?? []) {
      if (!idsEscalas.has(id)) di(`${que}: la escala "${id}" no existe en la base`);
    }
  }

  for (const s of base.susceptibilidades) {
    const que = `susceptibilidad "${s.id}"`;
    trazabilidad(que, s);
    vocabulario(que, hallazgosDeLaCondicion(s.cuando));
    if (s.eleva.length === 0) di(`${que}: no eleva ninguna sospecha`);
    for (const id of [...s.eleva, ...(s.relaja ?? [])]) {
      if (!idsActivadores.has(id)) di(`${que}: el activador "${id}" no existe en la base`);
    }
    for (const id of s.relaja ?? []) {
      const act = base.activadores.find((a) => a.id === id);
      if (act && !act.disparadoresRelajados) {
        di(`${que}: relaja "${id}", que no declara disparadores relajados`);
      }
    }
  }

  for (const arbol of base.arboles) {
    const que = `árbol "${arbol.id}"`;
    const ids = new Set(arbol.nodos.map((n) => n.id));
    if (!ids.has(arbol.raiz)) di(`${que}: la raíz "${arbol.raiz}" no es un nodo del árbol`);
    if (arbol.adelanta) vocabulario(que, arbol.adelanta);
    for (const nodo of arbol.nodos) {
      const cual = `${que}, nodo "${nodo.id}"`;
      if (!nodo.llena && !nodo.desenlace) {
        di(`${cual}: no pregunta nada y no concluye nada`);
      }
      if (nodo.llena) vocabulario(cual, [nodo.llena]);
      for (const rama of nodo.ramas ?? []) {
        vocabulario(cual, hallazgosDeLaCondicion(rama.cuando));
        if (!ids.has(rama.ir)) di(`${cual}: una rama va a "${rama.ir}", que no existe`);
      }
      if (nodo.desenlace) {
        const d = nodo.desenlace;
        if (!NIVELES.includes(d.nivel)) di(`${cual}: "${d.nivel}" no es un nivel de atención`);
        if (!esFechaValida(d.aprobadoPor?.fecha ?? '')) di(`${cual}: el desenlace no está aprobado con fecha`);
        // Encaminar no es orientar: un desenlace que dice "esto hay que
        // examinarlo" sin decir qué pasa deja a la persona alarmada y sin
        // entender (28-oct-2026).
        if (!d.paraElPaciente?.explicacionProbable?.trim()) {
          di(`${cual}: el desenlace no dice la explicación más probable`);
        }
        textoVisible(`${cual} (explicación)`, d.paraElPaciente?.explicacionProbable ?? '');
        textoVisible(`${cual} (lo que no se resuelve aquí)`, d.paraElPaciente?.noSeResuelveAqui ?? '');
        for (const paso of d.paraElPaciente?.planDelIntervalo ?? []) {
          textoVisible(`${cual} (plan del intervalo)`, paso);
        }
      }
    }
  }

  return problemas;
}
