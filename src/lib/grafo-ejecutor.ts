/**
 * El ejecutor del grafo: un turno de consulta, en código puro y sin modelo.
 *
 * Paso 3 del orden de construcción (`protocolos/grafo-de-decision.md`, §7).
 * Entra el estado de la consulta —la ficha, los hallazgos, el árbol en curso— y
 * sale **una** pregunta o un desenlace, siempre con el por qué.
 *
 * Que esto no llame al modelo es el punto, y no una optimización: un grafo se
 * prueba sin modelo, doscientos casos escritos pasan por aquí en milisegundos y
 * dan siempre lo mismo (§12). Así los falsos negativos se miden en `npm test` y
 * no en corridas caras contra Gemini. Al modelo le quedan dos trabajos
 * pequeños: convertir la frase de la persona en un valor con tipo, y decir el
 * texto del nodo con calidez.
 *
 * El recorrido es el de §7, en ese orden:
 *
 *   1. Correr las alarmas sobre lo que acaba de decir la persona.
 *   2. Reevaluar los síndromes y los activadores contra todos los hallazgos y
 *      contra la ficha.
 *   3. Elegir una pregunta, por prioridad.
 *   4. Si no queda nada por preguntar, o se agotó el presupuesto, concluir.
 *
 * **Nada de lo que queda abajo se descarta.** `siguiente` es la primera de la
 * cola, y la cola entera sale en el resultado: no se excluye, se prioriza.
 */

import { type HallazgoRegistrado, definicion } from './hallazgos';
import { type Ficha, camposAPreguntar, hallazgosDeLaFicha } from './ficha';
import {
  type Activador,
  type Alarma,
  type Arbol,
  type BaseDeReglas,
  type Condicion,
  type Desenlace,
  type Escala,
  type Nodo,
  type Sindrome,
  IDENTIFICACION,
  esCompuesta,
  evaluar,
  faltantes,
  hayAsidero,
} from './grafo-reglas';
import { type NivelAtencion, gravedad } from './resumen-consulta';

/**
 * Tope de preguntas por consulta. Sin tope, un grafo entrelazado interroga para
 * siempre (§7). **El número es un parámetro de producto, no criterio del médico
 * responsable todavía**: está aquí, con nombre y en un solo sitio, para que se
 * vea y se pueda cambiar.
 */
export const PRESUPUESTO_POR_DEFECTO = 25;

// ─────────────────────────────────────────────────────────────
// Entrada y salida
// ─────────────────────────────────────────────────────────────

export interface EstadoConsulta {
  ficha: Ficha;
  /** Hallazgos del episodio. Los de la ficha los vuelca el ejecutor. */
  hallazgos: readonly HallazgoRegistrado[];
  arbolActivo?: string;
  nodoActual?: string;
  /** Un motivo nuevo abre su árbol y el anterior se suspende, no se abandona. */
  suspendidos?: readonly { arbol: string; nodo: string }[];
  preguntasHechas?: number;
  presupuesto?: number;
  /** AAAA-MM-DD. */
  hoy: string;
  /** Campos de la ficha que el motivo de hoy volvió críticos (§2). */
  antecedentesCriticos?: readonly string[];
}

export const PRIORIDADES = [
  'alarma',
  'vida_aguda',
  'escala',
  'sospecha',
  'arbol',
  'antecedente_critico',
] as const;
export type PrioridadPregunta = (typeof PRIORIDADES)[number];

export interface Pregunta {
  /** El hallazgo que hay que llenar. La redacción la pone el nodo, no esto. */
  hallazgo: string;
  prioridad: PrioridadPregunta;
  /** Por qué esta y no otra. Va al informe: el orden en que se preguntó importa. */
  porque: string;
}

export interface AlarmaDisparada {
  alarma: Alarma;
  /** Las frases de las que salieron los hallazgos que la dispararon. */
  evidencia: string[];
}

export interface SospechaLevantada {
  activador: Activador;
  prioridad: 'alta' | 'media' | 'baja';
  /** Susceptibilidades de la ficha que le subieron la prioridad. */
  elevadaPor?: string[];
  /** Se evaluó con disparadores relajados porque un antecedente predice atipia. */
  relajadaPor?: string[];
  /** Explicaciones comunes presentes. La sospecha baja; nunca se descarta. */
  bajadaPor?: string[];
}

export interface EscalaIncompleta {
  escala: Escala;
  faltan: string[];
}

export const RAZONES_DE_PARADA = [
  /** Se disparó una alarma: se deja de preguntar y se escala. */
  'alarma',
  /** Se llegó a un nodo terminal con desenlace aprobado. */
  'desenlace',
  /** El siguiente paso útil exige algo que Hilda no puede obtener. */
  'suficiencia',
  /** Se agotó el presupuesto de preguntas. */
  'presupuesto',
  /** No queda nada por preguntar. */
  'nada_que_preguntar',
] as const;
export type RazonDeParada = (typeof RAZONES_DE_PARADA)[number];

export type SiguientePaso =
  | { tipo: 'preguntar'; pregunta: Pregunta; cola: Pregunta[] }
  | { tipo: 'concluir'; razon: RazonDeParada; desenlace?: Desenlace; cola: Pregunta[] };

export interface ResultadoTurno {
  alarmas: AlarmaDisparada[];
  /** Fijan el piso aunque la sospecha concreta falle. */
  sindromes: Sindrome[];
  sospechas: SospechaLevantada[];
  /** Escalas que no se pueden calcular, y qué les falta. Nunca un puntaje a medias. */
  escalasIncompletas: EscalaIncompleta[];
  /** El nivel mínimo que ya está fijado. Solo sube. */
  piso: NivelAtencion;
  siguiente: SiguientePaso;
  traza: string[];
}

// ─────────────────────────────────────────────────────────────
// El turno
// ─────────────────────────────────────────────────────────────

export function evaluarTurno(estado: EstadoConsulta, base: BaseDeReglas): ResultadoTurno {
  const traza: string[] = [];

  // La ficha se vuelca a hallazgos: el grafo empieza con una lectura, no con un
  // cuestionario. Lo de la conversación manda sobre lo de la ficha cuando
  // hablan del mismo hallazgo y la condición no dice cuál quiere.
  const deLaFicha = hallazgosDeLaFicha(estado.ficha, estado.hoy);
  const todos: HallazgoRegistrado[] = [
    ...estado.hallazgos,
    ...deLaFicha.filter(
      (f) => !estado.hallazgos.some((h) => h.id === f.id && h.temporalidad === f.temporalidad)
    ),
  ];

  // ── 1. Las alarmas, por encima de todo y sobre los hallazgos de hoy ──
  const paraAlarmas = todos.filter(
    (h) => h.temporalidad === 'actual' || IDENTIFICACION.includes(h.id)
  );

  const alarmas: AlarmaDisparada[] = [];
  const colaAlarmas: Pregunta[] = [];
  for (const alarma of base.alarmas) {
    const v = evaluar(alarma.cuando, paraAlarmas);
    if (v === 'si') {
      alarmas.push({ alarma, evidencia: evidenciaDe(alarma.cuando, paraAlarmas) });
      traza.push(`alarma "${alarma.id}" disparada: escala a ${alarma.escalaA}`);
    } else if (v === 'falta' && hayAsidero(alarma.cuando, paraAlarmas)) {
      // Solo con asidero. Una alarma detecta; no interroga a todo el mundo por
      // si acaso. El tamizaje que sí hay que hacer siempre lo hace el árbol.
      colaAlarmas.push(
        ...aPreguntas(
          faltantes(alarma.cuando, paraAlarmas),
          todos,
          'alarma',
          `lo que ya me contaste deja abierta la alarma "${alarma.id}"`
        )
      );
    }
  }

  // ── 2. Síndromes: el piso que no depende de acertar la enfermedad ──
  const sindromes = base.sindromes.filter((s) => evaluar(s.criterios, todos) === 'si');
  for (const s of sindromes) traza.push(`síndrome "${s.id}": piso ${s.piso}`);

  // ── 3. Susceptibilidades: lo que la ficha predice antes del primer síntoma ──
  const eleva = new Map<string, string[]>();
  const relaja = new Map<string, string[]>();
  for (const s of base.susceptibilidades) {
    if (evaluar(s.cuando, todos) !== 'si') continue;
    traza.push(`susceptibilidad "${s.id}" presente`);
    for (const id of s.eleva) eleva.set(id, [...(eleva.get(id) ?? []), s.id]);
    for (const id of s.relaja ?? []) relaja.set(id, [...(relaja.get(id) ?? []), s.id]);
  }

  // ── 4. Activadores ──
  const sospechas: SospechaLevantada[] = [];
  const colaVida: Pregunta[] = [];
  const colaSospecha: Pregunta[] = [];

  for (const act of base.activadores) {
    // Los requisitos compuertan la sospecha y sus preguntas extra, nunca el
    // piso de escalamiento. Sin requisitos cumplidos no se levanta, pero
    // tampoco se descarta: un hueco deja la puerta abierta a preguntarlo.
    const req = act.requisitos ? evaluar(act.requisitos, todos) : 'si';
    if (req === 'no') continue;

    const relajadaPor = relaja.get(act.id);
    const condicion =
      relajadaPor && act.disparadoresRelajados ? act.disparadoresRelajados : act.disparadores;
    const v = evaluar(condicion, todos);

    const tier: PrioridadPregunta = act.amenazaVidaAguda ? 'vida_aguda' : 'sospecha';
    const cola = act.amenazaVidaAguda ? colaVida : colaSospecha;

    // El mismo asidero que las alarmas: una sospecha pregunta cuando algo ya
    // dicho la hizo pertinente, o cuando sus requisitos están cumplidos. Sin
    // eso, veinte activadores serían veinte cuestionarios en paralelo.
    //
    // Un activador **sin** requisitos no hereda asidero por no tenerlos: al
    // contrario, es el que más lo necesita. Con requisitos cumplidos sí lo
    // tiene aunque no haya ningún síntoma todavía, que es justo lo que hace el
    // perfil de susceptibilidad de §5.1(a): pre-activar la sospecha.
    const asidero =
      (act.requisitos !== undefined && req === 'si') || hayAsidero(condicion, todos);

    // Lo común antes que lo raro (§5.1e): antes de levantar una sospecha grave
    // se pregunta lo que la explicaría de forma banal.
    const comunes = [...(act.explicacionesComunes ?? [])].sort(
      (a, b) => peso(a.frecuencia) - peso(b.frecuencia)
    );
    const bajadaPor: string[] = [];
    for (const x of comunes) {
      const vx = evaluar(x.cuando, todos);
      if (vx === 'si') bajadaPor.push(x.id);
      else if (vx === 'falta' && v !== 'no' && asidero) {
        cola.push(
          ...aPreguntas(
            faltantes(x.cuando, todos),
            todos,
            tier,
            `lo común primero: "${x.nombreClinico}" explicaría esto sin "${act.sospecha}"`
          )
        );
      }
    }

    if (v === 'si') {
      let prioridad = act.prioridad;
      const elevadaPor = eleva.get(act.id);
      if (elevadaPor) prioridad = subir(prioridad);
      for (const _ of bajadaPor) prioridad = bajar(prioridad);

      const levantada: SospechaLevantada = { activador: act, prioridad };
      if (elevadaPor) levantada.elevadaPor = elevadaPor;
      if (relajadaPor) levantada.relajadaPor = relajadaPor;
      if (bajadaPor.length) levantada.bajadaPor = bajadaPor;
      sospechas.push(levantada);
      traza.push(
        `sospecha "${act.sospecha}" levantada (${prioridad})` +
          (relajadaPor ? `, con disparadores relajados por ${relajadaPor.join(', ')}` : '') +
          (bajadaPor.length ? `, bajada por ${bajadaPor.join(', ')}` : '')
      );

      cola.push(
        ...aPreguntas(act.preguntas ?? [], todos, tier, `lo pide la sospecha "${act.sospecha}"`)
      );
    } else if (v === 'falta' && asidero) {
      cola.push(
        ...aPreguntas(faltantes(condicion, todos), todos, tier, `decide si hay "${act.sospecha}"`)
      );
    }

    if (req === 'falta' && asidero) {
      cola.push(
        ...aPreguntas(
          faltantes(act.requisitos as Condicion, todos),
          todos,
          tier,
          `requisito de "${act.sospecha}"`
        )
      );
    }
  }

  // ── 5. Escalas: completas o no se calculan ──
  const escalasIncompletas: EscalaIncompleta[] = [];
  const colaEscala: Pregunta[] = [];
  const pedidas = new Set(sospechas.flatMap((s) => s.activador.escalas ?? []));
  for (const escala of base.escalas) {
    if (!pedidas.has(escala.id)) continue;
    const faltan = escala.variables.filter((id) => sinResponder(id, todos));
    if (!faltan.length) continue;
    escalasIncompletas.push({ escala, faltan });
    traza.push(`escala "${escala.id}" incompleta: falta ${faltan.join(', ')}`);
    colaEscala.push(
      ...aPreguntas(
        faltan,
        todos,
        'escala',
        `sin este dato no se puede calcular "${escala.nombreClinico}"`
      )
    );
  }

  // ── 6. El árbol en curso ──
  const arbol = base.arboles.find((a) => a.id === estado.arbolActivo);
  const paso = arbol ? recorrer(arbol, estado.nodoActual ?? arbol.raiz, todos) : undefined;
  const colaArbol: Pregunta[] =
    paso?.tipo === 'preguntar'
      ? [{ hallazgo: paso.hallazgo, prioridad: 'arbol', porque: `lo pide el árbol de ${arbol?.motivo}` }]
      : [];

  // ── 7. Un antecedente viejo que el motivo volvió crítico ──
  const criticos = camposAPreguntar(
    estado.ficha,
    (estado.antecedentesCriticos ?? []).map((id) => ({ id, critico: true })),
    estado.hoy
  );
  const colaAntecedentes: Pregunta[] = criticos.map((id) => ({
    hallazgo: id,
    prioridad: 'antecedente_critico',
    porque: 'el motivo de hoy volvió crítico este antecedente, y está viejo o sin preguntar',
  }));

  const cola = dedup([
    ...colaAlarmas,
    ...colaVida,
    ...colaEscala,
    ...colaSospecha,
    ...colaArbol,
    ...colaAntecedentes,
  ]);

  // ── 8. Qué se hace ahora ──
  const siguiente = decidir(estado, alarmas, paso, cola, traza);

  // ── 9. El piso. Solo sube, y el desenlace del árbol es una propuesta más ──
  // Que el nivel definitivo salga de aquí y no de quien llame es a propósito:
  // el riesgo de este producto no es mandar de más a urgencias, es que una
  // señal de alarma quede escrita mientras el desenlace dice "manejo en casa".
  let piso: NivelAtencion = 'casa';
  const subirPiso = (n: NivelAtencion) => {
    if (gravedad(n) > gravedad(piso)) piso = n;
  };
  for (const a of alarmas) subirPiso(a.alarma.escalaA);
  for (const s of sindromes) subirPiso(s.piso);
  for (const s of sospechas) if (s.activador.nivelMinimo) subirPiso(s.activador.nivelMinimo);
  if (siguiente.tipo === 'concluir' && siguiente.desenlace) subirPiso(siguiente.desenlace.nivel);

  return { alarmas, sindromes, sospechas, escalasIncompletas, piso, siguiente, traza };
}

function decidir(
  estado: EstadoConsulta,
  alarmas: AlarmaDisparada[],
  paso: PasoArbol | undefined,
  cola: Pregunta[],
  traza: string[]
): SiguientePaso {
  // Ante señal de alarma se deja de preguntar y se escala. Es la única
  // excepción a la regla de una pregunta a la vez, y es del médico.
  if (alarmas.length) {
    traza.push('se deja de preguntar: hay una alarma disparada');
    return { tipo: 'concluir', razon: 'alarma', cola };
  }

  if (paso?.tipo === 'desenlace') {
    traza.push(`nodo terminal "${paso.nodo.id}": desenlace ${paso.desenlace.nivel}`);
    return { tipo: 'concluir', razon: 'desenlace', desenlace: paso.desenlace, cola };
  }

  const presupuesto = estado.presupuesto ?? PRESUPUESTO_POR_DEFECTO;
  if ((estado.preguntasHechas ?? 0) >= presupuesto) {
    traza.push(`se agotó el presupuesto de ${presupuesto} preguntas`);
    return { tipo: 'concluir', razon: 'presupuesto', cola };
  }

  if (cola.length) return { tipo: 'preguntar', pregunta: cola[0], cola };

  // Parada por suficiencia: el siguiente paso útil exige una medición, un
  // examen físico, un laboratorio o una imagen. Hilda no los puede obtener, así
  // que para y nombra el vacío (§7).
  if (paso?.tipo === 'suficiencia') {
    traza.push(`se para por suficiencia en "${paso.nodo.id}": el siguiente paso exige un instrumento`);
    return { tipo: 'concluir', razon: 'suficiencia', cola };
  }

  traza.push('no queda nada por preguntar');
  return { tipo: 'concluir', razon: 'nada_que_preguntar', cola };
}

// ─────────────────────────────────────────────────────────────
// Recorrer un árbol: decide qué preguntar, no qué es verdad
// ─────────────────────────────────────────────────────────────

type PasoArbol =
  | { tipo: 'preguntar'; nodo: Nodo; hallazgo: string }
  | { tipo: 'desenlace'; nodo: Nodo; desenlace: Desenlace }
  | { tipo: 'suficiencia'; nodo: Nodo }
  | { tipo: 'atascado'; nodo: Nodo };

function recorrer(arbol: Arbol, desde: string, hallazgos: readonly HallazgoRegistrado[]): PasoArbol | undefined {
  const porId = new Map(arbol.nodos.map((n) => [n.id, n]));
  let nodo = porId.get(desde);
  if (!nodo) return undefined;
  const vistos = new Set<string>();

  while (true) {
    if (vistos.has(nodo.id)) return { tipo: 'atascado', nodo };
    vistos.add(nodo.id);

    if (nodo.desenlace) return { tipo: 'desenlace', nodo, desenlace: nodo.desenlace };
    if (nodo.llena && sinResponder(nodo.llena, hallazgos)) {
      // El nodo exige algo que la persona no puede medir: no se pregunta, se para.
      return nodo.exigeInstrumento ? { tipo: 'suficiencia', nodo } : { tipo: 'preguntar', nodo, hallazgo: nodo.llena };
    }

    const rama = (nodo.ramas ?? []).find((r) => evaluar(r.cuando, hallazgos) === 'si');
    if (!rama) return { tipo: 'atascado', nodo };
    const siguiente = porId.get(rama.ir);
    if (!siguiente) return { tipo: 'atascado', nodo };
    nodo = siguiente;
  }
}

// ─────────────────────────────────────────────────────────────
// Menudencias
// ─────────────────────────────────────────────────────────────

/**
 * Convierte hallazgos que faltan en preguntas de verdad.
 *
 * Hace dos cosas que parecen de plomería y no lo son:
 *
 * - **Un derivado no se pregunta: se preguntan sus insumos.** Una regla que
 *   mira el IMC deja "imc" en la lista de lo que falta, y preguntarle a alguien
 *   su índice de masa corporal no tiene sentido. Lo que se pregunta es el peso
 *   y la talla, y solo los que falten.
 * - **No se pregunta lo que ya se contestó.** Ni lo que está en la ficha.
 */
function aPreguntas(
  ids: readonly string[],
  hallazgos: readonly HallazgoRegistrado[],
  prioridad: PrioridadPregunta,
  porque: string
): Pregunta[] {
  const expandidos = ids.flatMap((id) => {
    const def = definicion(id);
    return def?.tipo.clase === 'derivado' ? [...def.tipo.de] : [id];
  });
  return expandidos
    .filter((id) => sinResponder(id, hallazgos))
    .map((hallazgo) => ({ hallazgo, prioridad, porque }));
}

/** Sin responder: nadie lo preguntó, o quedó ambiguo y no decide conducta. */
function sinResponder(id: string, hallazgos: readonly HallazgoRegistrado[]): boolean {
  const h =
    hallazgos.find((x) => x.id === id && x.temporalidad === 'actual') ??
    hallazgos.find((x) => x.id === id);
  return !h || h.estado === 'no_preguntado' || h.ambiguo === true;
}

/** Las frases de las que salieron los hallazgos que cumplieron la condición. */
function evidenciaDe(cond: Condicion, hallazgos: readonly HallazgoRegistrado[]): string[] {
  const ids = new Set(evidenciaIds(cond, hallazgos));
  return [...ids]
    .map((id) => hallazgos.find((h) => h.id === id)?.frase)
    .filter((f): f is string => Boolean(f));
}

function evidenciaIds(cond: Condicion, hallazgos: readonly HallazgoRegistrado[]): string[] {
  if (esCompuesta(cond)) {
    return cond.de.flatMap((c) => evidenciaIds(c, hallazgos));
  }
  return evaluar(cond, hallazgos) === 'si' ? [cond.hallazgo] : [];
}

const peso = (f: 'alta' | 'media' | 'baja') => (f === 'alta' ? 0 : f === 'media' ? 1 : 2);
const subir = (p: 'alta' | 'media' | 'baja') => (p === 'baja' ? 'media' : 'alta');
const bajar = (p: 'alta' | 'media' | 'baja') => (p === 'alta' ? 'media' : 'baja');

/**
 * Una pregunta por hallazgo, y gana la de más prioridad. Dos reglas pueden
 * necesitar el mismo dato; preguntarlo dos veces es exactamente lo que la regla
 * de "no repetir nada" prohíbe.
 */
function dedup(cola: readonly Pregunta[]): Pregunta[] {
  const vistos = new Set<string>();
  const salida: Pregunta[] = [];
  for (const p of cola) {
    if (vistos.has(p.hallazgo)) continue;
    vistos.add(p.hallazgo);
    salida.push(p);
  }
  return salida;
}
