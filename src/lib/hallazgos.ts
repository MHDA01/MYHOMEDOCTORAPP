/**
 * El vocabulario de hallazgos: cómo se NOMBRA un hallazgo, no qué significa.
 *
 * Es el paso 1 del orden de construcción del grafo de decisión
 * (`protocolos/grafo-de-decision.md`, §3) y el cuello de botella de todo lo
 * demás: la ficha, el ejecutor, los activadores y el extractor hablan de
 * hallazgos, así que primero hay que poder nombrarlos sin ambigüedad.
 *
 * Lo que este archivo NO contiene, a propósito:
 *
 * - **Umbrales clínicos.** Que 38 °C sea fiebre o que una disnea escale a
 *   urgencias es criterio del médico responsable y vive en los activadores y
 *   las alarmas. Aquí solo hay rangos de *plausibilidad* (una temperatura de
 *   120 °C es un error de digitación, no una decisión clínica).
 * - **La pregunta que lee el paciente.** Cada nodo tiene dos textos: el nombre
 *   clínico, que es uno solo y universal, y la forma de preguntarlo, que
 *   depende del país y de la región (§9.1). El segundo es texto clínico
 *   visible: lo aprueba Alexander y se localiza. No entra aquí.
 * - **Nada que hable con Firestore ni con la red.** Son tipos y funciones
 *   puras, para poder probarlas sin emulador y sin modelo.
 *
 * Reglas del diseño que aquí se vuelven código y no buena intención:
 *
 * 1. **Ningún valor se infiere nunca** (§2). Un hallazgo sin procedencia no se
 *    puede registrar, y el sexo no se deduce de un nombre.
 * 2. **Cuatro estados**, no dos (§2). `negado` es "se preguntó y contestó que
 *    no"; `desconocido` es "se preguntó y no lo sabe", con su razón;
 *    `no_preguntado` es "nadie lo tocó". Escribir `negado` donde la persona
 *    dijo "no me he pesado" es poner en la historia una afirmación que nunca
 *    hizo.
 * 3. **No se calcula un puntaje al que le falte una variable** (§3). Se dice
 *    qué falta.
 * 4. **Las contradicciones se preguntan, no se sobrescriben** (§3). Un dato que
 *    cambió sin que nadie lo note es peor que un dato faltante, porque nadie va
 *    a volver a mirarlo.
 * 5. **El mismo vocabulario tiene dos vidas** (§3): "diabético" y "hoy tiene
 *    39" no son el mismo tipo de hecho. De ahí `temporalidad`.
 */

// ─────────────────────────────────────────────────────────────
// Los cuatro estados
// ─────────────────────────────────────────────────────────────

export const ESTADOS_HALLAZGO = ['positivo', 'negado', 'desconocido', 'no_preguntado'] as const;
export type EstadoHallazgo = (typeof ESTADOS_HALLAZGO)[number];

/** De dónde salió el dato. Sin esto no se registra nada (regla 1). */
export const PROCEDENCIAS = [
  /** Lo dijo la persona en la conversación. Exige la frase literal. */
  'relato',
  /** Venía de la ficha del integrante. */
  'ficha',
  /** Lo calculó el código a partir de otros hallazgos. Solo para derivados. */
  'calculo',
  /** Salió de una pregunta sustituta: da un hallazgo cualitativo, no una medición. */
  'sustituta',
] as const;
export type Procedencia = (typeof PROCEDENCIAS)[number];

/**
 * La trampa del tiempo verbal (§2). "Se me hinchó la cara hace cinco años" va a
 * la ficha; "se me está hinchando la cara" interrumpe todo. El vocabulario es
 * idéntico y la conducta es opuesta, así que la distinción tiene que viajar con
 * el hallazgo.
 */
export const TEMPORALIDADES = ['actual', 'antecedente'] as const;
export type Temporalidad = (typeof TEMPORALIDADES)[number];

// ─────────────────────────────────────────────────────────────
// Qué clase de dato es cada hallazgo
// ─────────────────────────────────────────────────────────────

export type ClaseHallazgo =
  /** Está o no está. El valor es el estado. */
  | { clase: 'presencia' }
  /** Medición con instrumento. `min` y `max` son plausibilidad, no clínica. */
  | { clase: 'numero'; unidad: string; min: number; max: number }
  | { clase: 'entero'; unidad?: string; min: number; max: number }
  /** Una de varias opciones cerradas. */
  | { clase: 'categoria'; opciones: readonly string[] }
  /** Escala numérica declarada por la persona (intensidad de 1 a 10). */
  | { clase: 'escala'; min: number; max: number }
  /** Texto en palabras de la persona. No se interpreta aquí. */
  | { clase: 'texto' }
  /** Lo calcula el código. Nunca se pregunta y nunca se acepta de fuera. */
  | { clase: 'derivado'; de: readonly string[]; unidad?: string };

export interface DefinicionHallazgo {
  /** Nombre interno, universal y en vocabulario médico. */
  id: string;
  /** Cómo lo lee el médico en el informe. */
  nombreClinico: string;
  tipo: ClaseHallazgo;
  /** Dónde se obtiene normalmente. `ficha` quiere decir que no se pregunta en la consulta. */
  origen: Procedencia;
  /**
   * Preguntas sustitutas (§3): cualitativas, sin instrumento, para no abandonar
   * un hallazgo porque la persona no sepa el dato exacto. Dan un hallazgo con
   * procedencia `sustituta`; **no dan una medición**.
   */
  sustitutas?: readonly string[];
  /** Puesto en el orden canónico de la anamnesis (§9), si es una de esas variables. */
  pasoAnamnesis?: number;
  /**
   * Está en el vocabulario pero el médico responsable todavía no lo aprobó.
   * Puede nombrarse y guardarse; no puede decidir conducta ni llegar al
   * paciente hasta que él lo apruebe.
   */
  pendienteAprobacion?: boolean;
}

// ─────────────────────────────────────────────────────────────
// El catálogo semilla
// ─────────────────────────────────────────────────────────────

/**
 * Solo están aquí las variables que el diseño o `criterio-clinico.md` nombran
 * explícitamente, la mayoría salidas de la prueba en vivo del 28-oct-2026.
 *
 * Es una **semilla**, no la lista final: el catálogo crece una patología a la
 * vez, con la matriz de consenso de §1.2. Añadir una fila aquí es nombrar algo,
 * que es barato; lo que cuesta y necesita al médico es decidir qué hace.
 */
export const HALLAZGOS: readonly DefinicionHallazgo[] = [
  // ── Ficha: lo que se carga y no se pregunta ──
  {
    id: 'edad_meses',
    nombreClinico: 'Edad en meses',
    tipo: { clase: 'entero', unidad: 'meses', min: 0, max: 1500 },
    origen: 'ficha',
  },
  {
    // "La edad sola descarta condiciones" (28-oct): es criterio clínico, no un
    // dato demográfico, y no se infiere. Si el registro no la trae, se pregunta.
    id: 'sexo_registrado',
    nombreClinico: 'Sexo registrado',
    tipo: { clase: 'categoria', opciones: ['masculino', 'femenino', 'otro'] },
    origen: 'ficha',
  },
  {
    // Campo aparte del anterior, como en el formato del médico responsable.
    // Solo cuando sea pertinente y la persona desee informarlo.
    id: 'identidad_de_genero',
    nombreClinico: 'Identidad de género',
    tipo: { clase: 'texto' },
    origen: 'relato',
  },
  {
    id: 'peso',
    nombreClinico: 'Peso',
    tipo: { clase: 'numero', unidad: 'kg', min: 0.3, max: 400 },
    origen: 'relato',
  },
  {
    id: 'talla',
    nombreClinico: 'Talla',
    tipo: { clase: 'numero', unidad: 'cm', min: 20, max: 250 },
    origen: 'relato',
  },
  {
    // Se calcula por código para que la obesidad entre como hallazgo aunque
    // nadie la reporte (criterio-clinico.md, pregunta 2).
    id: 'imc',
    nombreClinico: 'Índice de masa corporal',
    tipo: { clase: 'derivado', de: ['peso', 'talla'], unidad: 'kg/m2' },
    origen: 'calculo',
  },
  {
    // La medida que importa en el caso de prueba, y se puede tomar en casa con
    // una cinta, a diferencia de la tensión o del laboratorio.
    id: 'perimetro_abdominal',
    nombreClinico: 'Perímetro abdominal',
    tipo: { clase: 'numero', unidad: 'cm', min: 20, max: 250 },
    origen: 'relato',
  },
  {
    id: 'municipio_residencia',
    nombreClinico: 'Municipio de residencia',
    tipo: { clase: 'texto' },
    origen: 'ficha',
  },
  {
    // El nexo epidemiológico (§9.1): dónde ha estado no es dónde vive. La
    // ventana de tiempo la declara cada sospecha, no esta definición.
    id: 'estuvo_en',
    nombreClinico: 'Desplazamientos recientes',
    tipo: { clase: 'texto' },
    origen: 'relato',
  },

  // ── El orden canónico de la anamnesis (§9) ──
  {
    id: 'forma_de_inicio',
    nombreClinico: 'Forma de inicio',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 1,
  },
  {
    // El "en ocasiones" de la prueba del 28-oct calificaba el sueño, no el
    // dolor. Esta es la variable que se registró mal.
    id: 'patron_temporal',
    nombreClinico: 'Patrón temporal',
    tipo: { clase: 'categoria', opciones: ['continuo', 'intermitente', 'recurrente'] },
    origen: 'relato',
    pasoAnamnesis: 2,
  },
  {
    id: 'dias_de_evolucion',
    nombreClinico: 'Tiempo de evolución',
    tipo: { clase: 'entero', unidad: 'días', min: 0, max: 36500 },
    origen: 'relato',
    pasoAnamnesis: 3,
  },
  {
    id: 'localizacion',
    nombreClinico: 'Localización',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 4,
  },
  {
    id: 'irradiacion',
    nombreClinico: 'Irradiación',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 4,
  },
  {
    id: 'caracter',
    nombreClinico: 'Carácter',
    tipo: { clase: 'categoria', opciones: ['punzante', 'opresivo', 'ardor', 'colico', 'otro'] },
    origen: 'relato',
    pasoAnamnesis: 5,
  },
  {
    // La intensidad referida NO es la gravedad (§5.2b). Se guarda porque el
    // médico la quiere; no baja ningún nivel de atención.
    id: 'intensidad',
    nombreClinico: 'Intensidad referida',
    tipo: { clase: 'escala', min: 1, max: 10 },
    origen: 'relato',
    pasoAnamnesis: 6,
  },
  {
    id: 'que_mejora',
    nombreClinico: 'Factores de alivio',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 7,
  },
  {
    id: 'que_empeora',
    nombreClinico: 'Factores de agravación',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 7,
  },
  {
    id: 'sintomas_acompanantes',
    nombreClinico: 'Síntomas acompañantes',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 8,
  },
  {
    id: 'episodios_previos',
    nombreClinico: 'Episodios previos',
    tipo: { clase: 'texto' },
    origen: 'relato',
    pasoAnamnesis: 9,
  },

  // ── Clasificación del padecimiento (§3) ──
  {
    // El mecanismo manda sobre la duración: si el origen es un trauma, el
    // padecimiento es agudo y el tiempo no clasifica nada.
    id: 'mecanismo',
    nombreClinico: 'Mecanismo de presentación',
    tipo: { clase: 'categoria', opciones: ['traumatico', 'esfuerzo', 'otro'] },
    origen: 'relato',
  },
  {
    // Décima variable de la anamnesis. PENDIENTE de aprobación del médico: no
    // está todavía en el prompt de Hilda.
    id: 'curso_clinico',
    nombreClinico: 'Curso clínico',
    tipo: { clase: 'categoria', opciones: ['progresivo', 'estacionario', 'regresivo'] },
    origen: 'relato',
    pasoAnamnesis: 10,
    pendienteAprobacion: true,
  },

  // ── Impacto funcional: son dos momentos y hay que preguntar los dos (§9) ──
  { id: 'impacto_nocturno', nombreClinico: 'Interrumpe el sueño', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'impacto_diurno', nombreClinico: 'Limita las actividades del día', tipo: { clase: 'presencia' }, origen: 'relato' },

  // ── El hallazgo con sustitutas del 28-oct ──
  {
    id: 'cambio_de_peso',
    nombreClinico: 'Cambio de peso',
    tipo: { clase: 'categoria', opciones: ['aumento', 'disminucion', 'sin_cambio'] },
    origen: 'relato',
    sustitutas: [
      'si la ropa le queda más apretada o más holgada',
      'si tuvo que cambiar de talla o de agujero de la correa',
      'si alguien cercano le ha comentado el cambio',
    ],
  },

  // ── Hallazgos del caso de prueba y de los casos del médico ──
  { id: 'fiebre_medida', nombreClinico: 'Temperatura medida', tipo: { clase: 'numero', unidad: '°C', min: 33, max: 43 }, origen: 'relato' },
  { id: 'dolor_toracico', nombreClinico: 'Dolor torácico', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'dolor_epigastrico', nombreClinico: 'Dolor epigástrico', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'disnea', nombreClinico: 'Disnea', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'disnea_de_esfuerzo', nombreClinico: 'Disnea de esfuerzo', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'ortopnea', nombreClinico: 'Ortopnea', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'edema', nombreClinico: 'Edema', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'palpitaciones', nombreClinico: 'Palpitaciones', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'sudoracion', nombreClinico: 'Sudoración', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'boca_seca', nombreClinico: 'Xerostomía', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'debilidad_piernas', nombreClinico: 'Debilidad en miembros inferiores', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'ideacion_suicida', nombreClinico: 'Ideación suicida', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'tabaquismo', nombreClinico: 'Tabaquismo', tipo: { clase: 'presencia' }, origen: 'relato' },
  { id: 'sedentarismo', nombreClinico: 'Sedentarismo', tipo: { clase: 'presencia' }, origen: 'relato' },
] as const;

const POR_ID = new Map(HALLAZGOS.map((h) => [h.id, h]));

export function definicion(id: string): DefinicionHallazgo | undefined {
  return POR_ID.get(id);
}

/** El orden canónico de la anamnesis (§9), de menor a mayor paso. */
export function ordenCanonico(): DefinicionHallazgo[] {
  return HALLAZGOS.filter((h) => h.pasoAnamnesis !== undefined).sort(
    (a, b) => (a.pasoAnamnesis as number) - (b.pasoAnamnesis as number)
  );
}

// ─────────────────────────────────────────────────────────────
// Un hallazgo registrado
// ─────────────────────────────────────────────────────────────

export type ValorHallazgo = number | string;

export interface HallazgoRegistrado {
  id: string;
  estado: EstadoHallazgo;
  /** Ausente cuando el estado no es `positivo`, o cuando es una presencia. */
  valor?: ValorHallazgo;
  procedencia: Procedencia;
  /** La frase literal de la que salió. Obligatoria si la procedencia es `relato` o `sustituta`. */
  frase?: string;
  /** AAAA-MM-DD. Nunca ISO con hora: regla de la casa. */
  fecha: string;
  temporalidad: Temporalidad;
  /** La razón del `desconocido`: "no se ha pesado". */
  razon?: string;
  /**
   * La persona lo minimizó al contarlo: "un dolorcito", "nada serio", "no me
   * interrumpe nada". Es un hallazgo, no ruido (§5.2a), y con una
   * susceptibilidad encima SUBE la gravedad en vez de bajarla.
   */
  minimizado?: boolean;
  /**
   * La frase admitía dos lecturas y el calificativo podía anclarse a otra cosa
   * (§3). Un hallazgo ambiguo no decide conducta: se pregunta.
   */
  ambiguo?: boolean;
  /** Medición que no se pudo obtener. El valor sigue sin existir. */
  noMedido?: boolean;
}

export type Registro =
  | { ok: true; hallazgo: HallazgoRegistrado }
  | { ok: false; motivo: string };

export interface EntradaHallazgo {
  id: string;
  estado: EstadoHallazgo;
  valor?: ValorHallazgo;
  procedencia: Procedencia;
  frase?: string;
  fecha: string;
  temporalidad?: Temporalidad;
  razon?: string;
  minimizado?: boolean;
  ambiguo?: boolean;
  noMedido?: boolean;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Registra un hallazgo, o explica por qué no se puede.
 *
 * Es el único camino para que un hallazgo exista, y por eso aquí viven las
 * negativas. No devuelve excepciones porque el que llama —el extractor— va a
 * fallar a menudo: con una frase ambigua, con una unidad que no cuadra, con un
 * valor que la persona no dio. Un `motivo` legible es más útil que un throw.
 */
export function registrar(entrada: EntradaHallazgo): Registro {
  const def = definicion(entrada.id);
  if (!def) return { ok: false, motivo: `"${entrada.id}" no está en el vocabulario de hallazgos` };

  if (!FECHA.test(entrada.fecha)) {
    return { ok: false, motivo: `la fecha debe ser AAAA-MM-DD, no "${entrada.fecha}"` };
  }

  // Regla 1: ningún valor se infiere. Lo que vino del relato tiene que traer la
  // frase de la que salió, porque esa frase es la prueba de que alguien lo dijo.
  if ((entrada.procedencia === 'relato' || entrada.procedencia === 'sustituta') && !entrada.frase?.trim()) {
    return { ok: false, motivo: `"${entrada.id}" viene del relato y no trae la frase de la que salió` };
  }

  // Un derivado solo lo escribe el código; y el código no escribe nada más.
  if (def.tipo.clase === 'derivado' && entrada.procedencia !== 'calculo') {
    return { ok: false, motivo: `"${entrada.id}" es derivado: solo lo calcula el código` };
  }
  if (def.tipo.clase !== 'derivado' && entrada.procedencia === 'calculo') {
    return { ok: false, motivo: `"${entrada.id}" no es derivado: no se puede calcular, se pregunta` };
  }

  // Una sustituta da un hallazgo cualitativo, nunca una medición (§3).
  if (entrada.procedencia === 'sustituta' && (def.tipo.clase === 'numero' || def.tipo.clase === 'entero')) {
    return {
      ok: false,
      motivo: `"${entrada.id}" es una medición: una pregunta sustituta no la da, solo un hallazgo cualitativo`,
    };
  }

  if (entrada.estado === 'desconocido' && !entrada.razon?.trim()) {
    return { ok: false, motivo: `"${entrada.id}" quedó en desconocido sin decir por qué` };
  }
  if (entrada.estado === 'no_preguntado' && entrada.valor !== undefined) {
    return { ok: false, motivo: `"${entrada.id}" está sin preguntar y trae valor` };
  }

  if (entrada.estado === 'positivo') {
    const problema = valorFueraDeMolde(def, entrada.valor);
    if (problema) return { ok: false, motivo: problema };
  } else if (entrada.valor !== undefined) {
    return { ok: false, motivo: `"${entrada.id}" no es positivo y trae valor` };
  }

  const hallazgo: HallazgoRegistrado = {
    id: entrada.id,
    estado: entrada.estado,
    procedencia: entrada.procedencia,
    fecha: entrada.fecha,
    temporalidad: entrada.temporalidad ?? 'actual',
  };
  if (entrada.valor !== undefined) hallazgo.valor = entrada.valor;
  if (entrada.frase) hallazgo.frase = entrada.frase;
  if (entrada.razon) hallazgo.razon = entrada.razon;
  if (entrada.minimizado) hallazgo.minimizado = true;
  if (entrada.ambiguo) hallazgo.ambiguo = true;
  if (entrada.noMedido) hallazgo.noMedido = true;
  return { ok: true, hallazgo };
}

/** Devuelve el problema del valor, o `null` si encaja en el molde. */
function valorFueraDeMolde(def: DefinicionHallazgo, valor: ValorHallazgo | undefined): string | null {
  const t = def.tipo;
  if (t.clase === 'presencia') {
    return valor === undefined ? null : `"${def.id}" es una presencia: el estado ya lo dice todo`;
  }
  if (valor === undefined) return `"${def.id}" es positivo y no trae valor`;

  if (t.clase === 'texto') {
    return typeof valor === 'string' && valor.trim() ? null : `"${def.id}" espera texto`;
  }
  if (t.clase === 'categoria') {
    return t.opciones.includes(String(valor))
      ? null
      : `"${valor}" no es una opción de "${def.id}" (${t.opciones.join(', ')})`;
  }
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return `"${def.id}" espera un número`;
  }
  // Un derivado no declara rango: el rango lo imponen sus insumos.
  if (t.clase === 'derivado') return null;
  if (t.clase === 'entero' && !Number.isInteger(valor)) {
    return `"${def.id}" espera un entero`;
  }
  const { min, max } = t;
  if (valor < min || valor > max) {
    return `${valor} está fuera del rango de "${def.id}" (${min} a ${max})`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Derivados: se calculan completos o no se calculan
// ─────────────────────────────────────────────────────────────

/**
 * IMC a partir de peso y talla. Devuelve `null` si falta cualquiera de los dos:
 * no se calcula ningún puntaje al que le falte una variable (§3). El que llama
 * dice qué falta; no se rellena con un supuesto.
 */
export function imc(pesoKg?: number, tallaCm?: number): number | null {
  if (pesoKg === undefined || tallaCm === undefined) return null;
  if (!(pesoKg > 0) || !(tallaCm > 0)) return null;
  const metros = tallaCm / 100;
  return Math.round((pesoKg / (metros * metros)) * 10) / 10;
}

// ─────────────────────────────────────────────────────────────
// Contradicciones: se preguntan, no se sobrescriben
// ─────────────────────────────────────────────────────────────

export interface Contradiccion {
  id: string;
  previo: HallazgoRegistrado;
  nuevo: HallazgoRegistrado;
}

/**
 * Dos registros del mismo hallazgo se contradicen cuando los dos son
 * afirmaciones firmes y distintas. Un `no_preguntado` o un `desconocido` no
 * contradicen nada: no afirman nada. Un hallazgo `ambiguo` tampoco, porque
 * todavía no es una afirmación.
 */
export function contradice(previo: HallazgoRegistrado, nuevo: HallazgoRegistrado): boolean {
  if (previo.id !== nuevo.id) return false;
  if (previo.temporalidad !== nuevo.temporalidad) return false;
  if (previo.ambiguo || nuevo.ambiguo) return false;
  const firme = (h: HallazgoRegistrado) => h.estado === 'positivo' || h.estado === 'negado';
  if (!firme(previo) || !firme(nuevo)) return false;
  if (previo.estado !== nuevo.estado) return true;
  return previo.valor !== nuevo.valor;
}

/**
 * Incorpora un hallazgo nuevo al conjunto del episodio **sin reemplazar en
 * silencio**: si contradice algo ya guardado, se queda el previo y la
 * contradicción sale en la lista para preguntarla.
 *
 * Que el previo gane no es una preferencia por lo viejo: es que un cambio sin
 * aclarar no es una corrección, y quien decide cuál vale es la persona.
 */
export function incorporar(
  hallazgos: readonly HallazgoRegistrado[],
  nuevo: HallazgoRegistrado
): { hallazgos: HallazgoRegistrado[]; contradicciones: Contradiccion[] } {
  const contradicciones: Contradiccion[] = [];
  let reemplazado = false;
  const resultado = hallazgos.map((previo) => {
    if (previo.id !== nuevo.id || previo.temporalidad !== nuevo.temporalidad) return previo;
    if (contradice(previo, nuevo)) {
      contradicciones.push({ id: nuevo.id, previo, nuevo });
      return previo;
    }
    reemplazado = true;
    // Sin contradicción, el nuevo completa al previo: un `no_preguntado` que
    // pasa a `positivo`, o un valor que se precisa sin negar el anterior.
    return nuevo;
  });
  if (!reemplazado && contradicciones.length === 0) resultado.push(nuevo);
  return { hallazgos: resultado, contradicciones };
}

/** Los que nunca se tocaron, de una lista de hallazgos que a alguien le interesan. */
export function sinPreguntar(
  interesan: readonly string[],
  hallazgos: readonly HallazgoRegistrado[]
): string[] {
  return interesan.filter((id) => {
    const h = hallazgos.find((x) => x.id === id);
    return !h || h.estado === 'no_preguntado';
  });
}

/**
 * Lo que no puede decidir conducta todavía: hallazgos ambiguos y variables cuyo
 * nombre está en el catálogo pero el médico responsable no ha aprobado.
 */
export function noDecideConducta(hallazgos: readonly HallazgoRegistrado[]): HallazgoRegistrado[] {
  return hallazgos.filter((h) => h.ambiguo || definicion(h.id)?.pendienteAprobacion);
}
