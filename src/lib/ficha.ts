/**
 * La ficha: la raíz del grafo, por integrante y no por cuenta.
 *
 * Paso 2 del orden de construcción (`protocolos/grafo-de-decision.md`, §2).
 * Son los antecedentes de una persona, con cuatro estados y fecha por campo, y
 * dos capas: lo que dijo la persona y lo que un médico caracterizó.
 *
 * Igual que `hallazgos.ts`, esto es código puro: no habla con Firestore ni con
 * la red, y no contiene umbrales clínicos ni texto que lea el paciente.
 *
 * Las cuatro reglas del diseño que aquí dejan de depender de la disciplina:
 *
 * 1. **Un negativo es un registro, no un campo vacío.** "No tiene alergias" y
 *    "nadie preguntó por alergias" se ven igual en un formulario corriente;
 *    aquí no. Y un campo vacío **nunca** se lee como `negado`: eso escribiría
 *    en la historia una afirmación que la persona no hizo.
 * 2. **El validado no borra el referido.** El valor vigente es el del médico si
 *    existe, pero el referido queda como prueba de que la pregunta se hizo y de
 *    qué se contestó. La norma exige que una anotación previa no se altere en
 *    silencio.
 * 3. **El rótulo del paciente no es el hecho clínico.** Una alergia referida se
 *    caracteriza, no se reclasifica, y **nunca se autoriza un suministro**. Para
 *    su propia conducta, Hilda la trata como real.
 * 4. **Se vuelve a preguntar poco y con motivo.** Los positivos envejecen y se
 *    reverifican; los negativos solo se ratifican si el motivo de hoy los
 *    volvió críticos. En una consulta normal eso es cero o una pregunta.
 */

import type { CursoDeVida } from './protocolos';
import {
  type EstadoHallazgo,
  type HallazgoRegistrado,
  type ValorHallazgo,
  definicion,
  imc,
} from './hallazgos';

// ─────────────────────────────────────────────────────────────
// Fechas: texto AAAA-MM-DD, nunca ISO con hora
// ─────────────────────────────────────────────────────────────

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Hoy en Bogotá, como AAAA-MM-DD. La app es colombiana; el servidor no siempre. */
export function fechaDeHoy(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(ahora);
}

export function esFechaValida(fecha: string): boolean {
  return FECHA.test(fecha);
}

/**
 * Edad en meses cumplidos. `null` si la fecha de nacimiento no está o no es
 * válida: la edad no se estima. "La edad sola descarta condiciones" (criterio
 * del médico responsable, 28-oct-2026), así que un supuesto aquí se propaga a
 * toda la epidemiología y a los umbrales que dependen de ella.
 */
export function edadEnMeses(fechaNacimiento: string | undefined, hoy: string): number | null {
  if (!fechaNacimiento) return null;
  const n = FECHA.exec(fechaNacimiento);
  const h = FECHA.exec(hoy);
  if (!n || !h) return null;
  const meses = (Number(h[1]) - Number(n[1])) * 12 + (Number(h[2]) - Number(n[2]));
  const cumplidos = Number(h[3]) >= Number(n[3]) ? meses : meses - 1;
  return cumplidos < 0 ? null : cumplidos;
}

/** Días entre dos fechas AAAA-MM-DD. Negativo si la segunda es anterior. */
export function diasEntre(desde: string, hasta: string): number {
  const a = FECHA.exec(desde);
  const b = FECHA.exec(hasta);
  if (!a || !b) return NaN;
  const ms =
    Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3])) -
    Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  return Math.round(ms / 86_400_000);
}

// ─────────────────────────────────────────────────────────────
// Quién lo dijo y cómo lo supo
// ─────────────────────────────────────────────────────────────

export const INFORMANTES = ['paciente', 'cuidador', 'medico'] as const;
export type Informante = (typeof INFORMANTES)[number];

/** Cada positivo lleva cómo lo supo la persona, y desde cuándo (§2). */
export const COMO_LO_SUPO = ['diagnostico_medico', 'se_lo_dijeron', 'el_lo_cree'] as const;
export type ComoLoSupo = (typeof COMO_LO_SUPO)[number];

export interface Magnitud {
  valor: number;
  unidad: string;
  /** Fecha del último valor conocido, AAAA-MM-DD. */
  fecha?: string;
}

/** Una capa del campo: lo que una persona afirmó, en un momento. */
export interface CapaFicha {
  estado: EstadoHallazgo;
  /** El valor tipado, cuando el campo tiene uno (peso, semanas al nacer). */
  valor?: ValorHallazgo;
  /** En palabras de quien lo informó. */
  detalle?: string;
  /**
   * "Quiste renal: sí" no habría servido de nada; un quiste de casi un litro es
   * otro objeto clínico (§5.1b). Los positivos llevan su magnitud cuando existe.
   */
  magnitud?: Magnitud;
  comoLoSupo?: ComoLoSupo;
  /** Desde cuándo, tal como lo dijo la persona. */
  desde?: string;
  /** Obligatoria en `desconocido`: "no se ha pesado". */
  razon?: string;
  /** Alergias caracterizadas de este campo, si es el alérgico. */
  alergias?: Alergia[];
  /**
   * Texto libre que venía del perfil viejo y que nadie ha estructurado. No
   * puede decidir conducta: convertirlo en antecedentes tipados sería inferir.
   */
  sinEstructurar?: boolean;
  /** AAAA-MM-DD. */
  fecha: string;
  informante: Informante;
}

export interface CapaValidada extends CapaFicha {
  informante: 'medico';
  medico: { nombre: string; registroProfesional: string };
}

/**
 * Un campo de la ficha, con sus dos capas. El referido nunca se borra; el
 * validado se añade encima.
 */
export interface CampoFicha {
  referido?: CapaFicha;
  validado?: CapaValidada;
}

export interface Ficha {
  /** Por integrante: un niño de dos años tiene su propia historia perinatal. */
  integranteId: string;
  campos: Record<string, CampoFicha>;
}

export function fichaVacia(integranteId: string): Ficha {
  return { integranteId, campos: {} };
}

// ─────────────────────────────────────────────────────────────
// El catálogo de la ficha: tres partes
// ─────────────────────────────────────────────────────────────

export const PARTES_FICHA = ['identificacion', 'universal', 'curso_de_vida', 'motivo'] as const;
export type ParteFicha = (typeof PARTES_FICHA)[number];

export interface DefinicionCampo {
  id: string;
  nombreClinico: string;
  parte: ParteFicha;
  /** Si el campo es también un hallazgo, su id en `hallazgos.ts`. */
  hallazgo?: string;
  /** Solo aplica a estos cursos de vida. Vacío o ausente: a todos. */
  cursosDeVida?: readonly CursoDeVida[];
  /** Es un grupo de texto libre heredado del perfil, no un valor tipado. */
  textoLibre?: boolean;
}

/**
 * Semilla, no lista final. Lo universal sale de `criterio-clinico.md` (pregunta
 * 2: patológicos, quirúrgicos, alérgicos, y **siempre peso y talla**); lo de
 * curso de vida y lo de motivo, de la pregunta 1.
 *
 * La lista completa de quince tipos de antecedentes está en el formato de
 * historia clínica del médico responsable y entra cuando se estructure.
 */
export const CAMPOS_FICHA: readonly DefinicionCampo[] = [
  // ── Identificación: ningún valor se infiere, ni el sexo por el nombre ──
  { id: 'fecha_de_nacimiento', nombreClinico: 'Fecha de nacimiento', parte: 'identificacion' },
  { id: 'sexo_registrado', nombreClinico: 'Sexo registrado', parte: 'identificacion', hallazgo: 'sexo_registrado' },
  { id: 'identidad_de_genero', nombreClinico: 'Identidad de género', parte: 'identificacion', hallazgo: 'identidad_de_genero' },
  { id: 'municipio_residencia', nombreClinico: 'Municipio de residencia', parte: 'identificacion', hallazgo: 'municipio_residencia' },

  // ── Universal: se pregunta en todos los casos, sin importar el motivo ──
  { id: 'patologicos', nombreClinico: 'Antecedentes patológicos', parte: 'universal', textoLibre: true },
  { id: 'quirurgicos', nombreClinico: 'Antecedentes quirúrgicos', parte: 'universal', textoLibre: true },
  { id: 'alergicos', nombreClinico: 'Antecedentes alérgicos', parte: 'universal' },
  { id: 'farmacologicos', nombreClinico: 'Antecedentes farmacológicos', parte: 'universal', textoLibre: true },
  { id: 'ginecologicos', nombreClinico: 'Antecedentes ginecológicos', parte: 'universal', textoLibre: true },
  { id: 'familiares', nombreClinico: 'Antecedentes familiares', parte: 'universal', textoLibre: true },
  { id: 'peso', nombreClinico: 'Peso', parte: 'universal', hallazgo: 'peso' },
  { id: 'talla', nombreClinico: 'Talla', parte: 'universal', hallazgo: 'talla' },
  { id: 'tabaquismo', nombreClinico: 'Tabaquismo', parte: 'universal', hallazgo: 'tabaquismo' },

  // ── Curso de vida: en primera infancia, toda la historia pediátrica ──
  { id: 'semanas_al_nacer', nombreClinico: 'Semanas al nacer', parte: 'curso_de_vida', cursosDeVida: ['primera_infancia'] },
  { id: 'lactancia', nombreClinico: 'Lactancia', parte: 'curso_de_vida', cursosDeVida: ['primera_infancia'] },
  { id: 'hitos_motores', nombreClinico: 'Hitos del desarrollo motor', parte: 'curso_de_vida', cursosDeVida: ['primera_infancia', 'infancia'] },

  // ── Por motivo: lo del caso de la uña encarnada, que el médico usó de ejemplo ──
  { id: 'oficio', nombreClinico: 'Oficio', parte: 'motivo' },
  { id: 'actividad_fisica', nombreClinico: 'Actividad física', parte: 'motivo', hallazgo: 'sedentarismo' },
  { id: 'calzado', nombreClinico: 'Calzado habitual', parte: 'motivo' },
  { id: 'exposiciones', nombreClinico: 'Exposiciones', parte: 'motivo', textoLibre: true },
];

const CAMPO_POR_ID = new Map(CAMPOS_FICHA.map((c) => [c.id, c]));

export function definicionCampo(id: string): DefinicionCampo | undefined {
  return CAMPO_POR_ID.get(id);
}

/** Los campos que aplican a un curso de vida: los de todos, más los suyos. */
export function camposDelCurso(curso: CursoDeVida): DefinicionCampo[] {
  return CAMPOS_FICHA.filter((c) => !c.cursosDeVida || c.cursosDeVida.includes(curso));
}

// ─────────────────────────────────────────────────────────────
// Leer la ficha
// ─────────────────────────────────────────────────────────────

/**
 * La capa vigente: la del médico si existe, la referida si no.
 * `undefined` cuando el campo nunca se tocó — que es distinto de un negativo.
 */
export function capaVigente(campo: CampoFicha | undefined): CapaFicha | undefined {
  return campo?.validado ?? campo?.referido;
}

/**
 * El estado vigente de un campo. Un campo ausente es `no_preguntado`, nunca
 * `negado`: es la regla 1, y es la que evita escribir en la historia una
 * afirmación que nadie hizo.
 */
export function estadoVigente(ficha: Ficha, id: string): EstadoHallazgo {
  return capaVigente(ficha.campos[id])?.estado ?? 'no_preguntado';
}

export function valorVigente(ficha: Ficha, id: string): ValorHallazgo | undefined {
  return capaVigente(ficha.campos[id])?.valor;
}

/** ¿Lo caracterizó un médico? Cambia la vigencia y lo que se le vuelve a preguntar. */
export function estaValidado(ficha: Ficha, id: string): boolean {
  return ficha.campos[id]?.validado !== undefined;
}

// ─────────────────────────────────────────────────────────────
// De los hallazgos de una consulta a la ficha
// ─────────────────────────────────────────────────────────────

/** El campo de la ficha que corresponde a un hallazgo, si alguno. */
const CAMPO_POR_HALLAZGO = new Map(
  CAMPOS_FICHA.filter((c) => c.hallazgo).map((c) => [c.hallazgo as string, c])
);

export interface Incorporacion {
  ficha: Ficha;
  /** Los que entraron, por id de campo. */
  guardados: string[];
  /** Los que no, con el motivo. Se registran: es como se ve qué se está perdiendo. */
  omitidos: Array<{ id: string; motivo: string }>;
}

/**
 * Mete en la ficha los hallazgos de una consulta que son **antecedentes**.
 *
 * Dos filtros, y los dos son de diseño, no de comodidad:
 *
 * 1. **Solo lo que es antecedente.** "Me duele el pecho ahora" es del episodio
 *    de hoy, no de la historia de la persona. La ficha es la raíz, lo estable;
 *    meter ahí lo de hoy la convertiría en un diario y haría que la próxima
 *    consulta arrancara con el dolor de la anterior como si siguiera.
 * 2. **Solo lo que tiene campo en la ficha.** La localización o la intensidad
 *    de un dolor no son antecedentes de nadie: pertenecen al episodio (§11),
 *    que todavía no existe. Hasta que exista, se quedan fuera y se dice.
 *
 * Lo que entra, entra como **referido**: lo contó la persona, no lo caracterizó
 * un médico. La capa validada no se toca nunca desde aquí.
 */
export function incorporarHallazgos(
  ficha: Ficha,
  hallazgos: readonly HallazgoRegistrado[]
): Incorporacion {
  let actual = ficha;
  const guardados: string[] = [];
  const omitidos: Array<{ id: string; motivo: string }> = [];

  for (const h of hallazgos) {
    if (h.temporalidad !== 'antecedente') {
      omitidos.push({ id: h.id, motivo: 'es del episodio de hoy, no un antecedente' });
      continue;
    }
    const campo = CAMPO_POR_HALLAZGO.get(h.id);
    if (!campo) {
      omitidos.push({ id: h.id, motivo: 'no tiene campo en la ficha' });
      continue;
    }
    // Un campo que ya caracterizó un médico no lo pisa un relato.
    if (actual.campos[campo.id]?.validado) {
      omitidos.push({ id: h.id, motivo: 'ya lo caracterizó un médico' });
      continue;
    }

    const capa: CapaFicha = {
      estado: h.estado,
      fecha: h.fecha,
      informante: 'paciente',
      ...(h.valor !== undefined ? { valor: h.valor } : {}),
      ...(h.frase ? { detalle: h.frase } : {}),
      ...(h.razon ? { razon: h.razon } : {}),
    };
    const escrito = registrarReferido(actual, campo.id, capa);
    if (escrito.ok) {
      actual = escrito.ficha;
      guardados.push(campo.id);
    } else {
      omitidos.push({ id: h.id, motivo: escrito.motivo });
    }
  }

  return { ficha: actual, guardados, omitidos };
}

// ─────────────────────────────────────────────────────────────
// Escribir la ficha
// ─────────────────────────────────────────────────────────────

export type Escritura = { ok: true; ficha: Ficha } | { ok: false; motivo: string };

/** Lo que dijo la persona o su cuidador. Reemplaza solo la capa referida. */
export function registrarReferido(ficha: Ficha, id: string, capa: CapaFicha): Escritura {
  const def = definicionCampo(id);
  if (!def) return { ok: false, motivo: `"${id}" no es un campo de la ficha` };
  if (!esFechaValida(capa.fecha)) {
    return { ok: false, motivo: `la fecha de "${id}" debe ser AAAA-MM-DD, no "${capa.fecha}"` };
  }
  if (capa.informante === 'medico') {
    return { ok: false, motivo: `lo que caracteriza un médico se guarda con validar(), no como referido` };
  }
  if (capa.estado === 'desconocido' && !capa.razon?.trim()) {
    return { ok: false, motivo: `"${id}" quedó en desconocido sin decir por qué` };
  }
  if (capa.estado === 'no_preguntado') {
    return { ok: false, motivo: `"${id}" no se registra como no_preguntado: eso es la ausencia del campo` };
  }
  if (capa.estado !== 'positivo' && capa.valor !== undefined) {
    return { ok: false, motivo: `"${id}" no es positivo y trae valor` };
  }
  return {
    ok: true,
    ficha: { ...ficha, campos: { ...ficha.campos, [id]: { ...ficha.campos[id], referido: capa } } },
  };
}

/**
 * Lo que un médico caracterizó, en teleconsulta o presencial. Se añade encima
 * del referido, que **no se borra** (regla 2), y exige identificación
 * profesional: no es la misma autoridad que aprobar protocolos en el panel.
 */
export function validar(
  ficha: Ficha,
  id: string,
  capa: Omit<CapaValidada, 'informante'>
): Escritura {
  const def = definicionCampo(id);
  if (!def) return { ok: false, motivo: `"${id}" no es un campo de la ficha` };
  if (!esFechaValida(capa.fecha)) {
    return { ok: false, motivo: `la fecha de "${id}" debe ser AAAA-MM-DD, no "${capa.fecha}"` };
  }
  if (!capa.medico?.nombre?.trim() || !capa.medico?.registroProfesional?.trim()) {
    return { ok: false, motivo: `validar "${id}" exige el nombre y el registro profesional del médico` };
  }
  const validada: CapaValidada = { ...capa, informante: 'medico' };
  return {
    ok: true,
    ficha: { ...ficha, campos: { ...ficha.campos, [id]: { ...ficha.campos[id], validado: validada } } },
  };
}

// ─────────────────────────────────────────────────────────────
// Cuándo se vuelve a preguntar
// ─────────────────────────────────────────────────────────────

/**
 * **Estos números no son criterio del médico responsable todavía.** Son un
 * parámetro de producto puesto para que el código corra, y están aquí —con
 * nombre y en un solo sitio— precisamente para que se vean y se puedan cambiar
 * cuando él los fije. La *forma* de la política sí es suya: los positivos se
 * reverifican cuando están viejos, los negativos solo si el motivo los volvió
 * críticos, y lo que validó un médico dura más.
 */
export const VIGENCIA_POR_DEFECTO = {
  /** Días tras los cuales un positivo referido se vuelve a preguntar. */
  positivoReferido: 180,
  /** Un positivo caracterizado por un médico aguanta más. */
  positivoValidado: 365,
  /** Un negativo crítico para el motivo de hoy: cada cuánto se ratifica. */
  negativoCritico: 365,
  pendienteDeCriterioDelMedico: true,
} as const;

export type Vigencia = Omit<typeof VIGENCIA_POR_DEFECTO, 'pendienteDeCriterioDelMedico'>;

export interface ContextoPregunta {
  /** AAAA-MM-DD. */
  hoy: string;
  /**
   * El árbol activo o un activador necesita este campo hoy. Un negativo solo se
   * vuelve a preguntar si es crítico: "sin transfusiones" es irrelevante para
   * una uña encarnada y decisivo frente a una anemia.
   */
  critico?: boolean;
  vigencia?: Vigencia;
}

/**
 * Si hay que preguntar un campo en esta consulta, y por qué.
 *
 * La regla del diseño: se vuelve a preguntar solo si el árbol activo o un
 * activador lo necesita **y** está viejo. En una consulta normal eso es cero o
 * una pregunta, no quince.
 */
export function hayQuePreguntar(
  ficha: Ficha,
  id: string,
  ctx: ContextoPregunta
): { preguntar: boolean; porque: string } {
  const v = ctx.vigencia ?? VIGENCIA_POR_DEFECTO;
  const campo = ficha.campos[id];
  const capa = capaVigente(campo);
  if (!capa) return { preguntar: true, porque: 'nunca se preguntó' };

  const edad = diasEntre(capa.fecha, ctx.hoy);

  if (capa.estado === 'positivo') {
    const tope = campo?.validado ? v.positivoValidado : v.positivoReferido;
    return edad > tope
      ? { preguntar: true, porque: `positivo de hace ${edad} días: toca reverificarlo` }
      : { preguntar: false, porque: 'positivo vigente' };
  }

  if (capa.estado === 'desconocido') {
    return ctx.critico
      ? { preguntar: true, porque: 'quedó en desconocido y hoy es crítico' }
      : { preguntar: false, porque: 'desconocido y hoy no es crítico' };
  }

  // negado
  if (!ctx.critico) return { preguntar: false, porque: 'negativo que el motivo de hoy no vuelve crítico' };
  return edad > v.negativoCritico
    ? { preguntar: true, porque: `negativo crítico de hace ${edad} días: toca ratificarlo` }
    : { preguntar: false, porque: 'negativo crítico ya ratificado' };
}

/** Los campos que hay que preguntar, de una lista que el grafo considera relevante. */
export function camposAPreguntar(
  ficha: Ficha,
  relevantes: readonly { id: string; critico?: boolean }[],
  hoy: string,
  vigencia?: Vigencia
): string[] {
  return relevantes
    .filter((r) => hayQuePreguntar(ficha, r.id, { hoy, critico: r.critico, vigencia }).preguntar)
    .map((r) => r.id);
}

// ─────────────────────────────────────────────────────────────
// Alergias: se caracterizan, no se reclasifican
// ─────────────────────────────────────────────────────────────

export const MANIFESTACIONES_ALERGIA = [
  'hinchazon_cara_o_labios',
  'ahogo_o_silbido',
  'ronchas_generalizadas',
  'desmayo',
  'nausea_o_dolor_abdominal',
  'somnolencia',
  'otra',
] as const;
export type ManifestacionAlergia = (typeof MANIFESTACIONES_ALERGIA)[number];

/**
 * Las manifestaciones que el diseño (§2) separa como fenotipo peligroso, frente
 * a una intolerancia. Sirve para lo que el médico necesita ver marcado; **no
 * sirve para descartar nada**: ver `debeAdvertir`.
 */
export const FENOTIPO_PELIGROSO: readonly ManifestacionAlergia[] = [
  'hinchazon_cara_o_labios',
  'ahogo_o_silbido',
  'ronchas_generalizadas',
  'desmayo',
];

export const LATENCIA_ALERGIA = ['minutos', 'horas', 'dias', 'no_recuerda'] as const;
export const QUE_SE_HIZO = ['urgencias', 'suspendio', 'nada'] as const;
export const REEXPOSICION = ['si_sin_problema', 'si_le_paso_igual', 'no'] as const;

export interface Alergia {
  /** Lo que dijo la persona: "ibuprofeno", no "AINE". No se reclasifica. */
  sustancia: string;
  manifestaciones: ManifestacionAlergia[];
  cuantoDespues?: (typeof LATENCIA_ALERGIA)[number];
  queSeHizo?: (typeof QUE_SE_HIZO)[number];
  volvioATomarla?: (typeof REEXPOSICION)[number];
}

/**
 * Completa o incompleta. Se calcula, no se declara: una alergia referida sin
 * caracterizar viaja al médico **marcada como sin caracterizar**, que es
 * precisamente lo que él necesita saber.
 */
export function caracterizacion(a: Alergia): 'completa' | 'incompleta' {
  return a.sustancia.trim() &&
    a.manifestaciones.length > 0 &&
    a.cuantoDespues &&
    a.queSeHizo &&
    a.volvioATomarla
    ? 'completa'
    : 'incompleta';
}

export function fenotipoPeligroso(a: Alergia): boolean {
  return a.manifestaciones.some((m) => FENOTIPO_PELIGROSO.includes(m));
}

/**
 * Siempre `true`, y eso es el punto.
 *
 * Para su propia conducta, Hilda trata la alergia referida como real:
 * caracterizarla no debilita la advertencia, y que una reacción no parezca
 * alérgica no descarta el suministro ni lo permite — eso lo decide el médico,
 * con el paciente al frente. La función existe para que el día que alguien
 * quiera condicionar la advertencia al fenotipo tenga que borrar esta línea y
 * la prueba que la cuida.
 */
export function debeAdvertir(_alergia: Alergia): true {
  return true;
}

// ─────────────────────────────────────────────────────────────
// Puente con el perfil que ya existe
// ─────────────────────────────────────────────────────────────

/** Lo que hoy guarda `FamilyProfile`, en los nombres con que lo guarda. */
export interface PerfilExistente {
  id: string;
  sex?: 'male' | 'female' | 'other';
  dateOfBirth?: string;
  /**
   * El día en que se creó la cuenta, AAAA-MM-DD. Sirve para detectar los
   * valores que el formulario de registro inventa: ver `fichaDesdePerfil`.
   */
  creadoEl?: string;
  weight?: number;
  allergies?: string[];
  medications?: string[];
  pathologicalHistory?: string;
  surgicalHistory?: string;
  gynecologicalHistory?: string;
  familyHistory?: string;
}

const SEXO: Record<string, string> = { male: 'masculino', female: 'femenino', other: 'otro' };

/**
 * Levanta una ficha a partir del perfil que la app ya tiene, sin inventar nada.
 *
 * Las dos decisiones que importan, y son la razón de ser de este puente:
 *
 * - **Una lista vacía no es un negativo.** `allergies: []` en el perfil de hoy
 *   quiere decir que nadie llenó el campo, no que la persona niegue alergias.
 *   Queda `no_preguntado`, o sea ausente, y Hilda lo preguntará. Convertirlo en
 *   `negado` escribiría en la historia miles de afirmaciones que nadie hizo.
 * - **El texto libre no se vuelve antecedentes tipados.** `pathologicalHistory`
 *   es una cadena que alguien escribió; partirla en positivos sería inferir, que
 *   es justo lo que el grafo no hace. Entra como `sinEstructurar`, visible para
 *   el médico y sin poder de decidir conducta.
 *
 * `fecha` es la del perfil (su `updatedAt`), porque hoy el documento tiene una
 * sola fecha para todo. Lo que se escriba de ahora en adelante lleva la suya.
 *
 * **Y una venda, no un arreglo:** el formulario de registro de hoy no pregunta
 * la fecha de nacimiento ni el sexo, los inventa —`sex: 'other'` y
 * `dateOfBirth` igual al día del registro (`register-form.tsx`)—. Son los dos
 * estratificadores de toda la epidemiología del diseño, y con la edad en cero
 * una alarma de fiebre en el menor de tres meses se dispararía con todos los
 * adultos. Así que si se pasa `creadoEl` y la fecha de nacimiento coincide con
 * ella, los dos campos quedan **sin preguntar**: nadie nace el día que se
 * registra, y los dos salen del mismo bloque inventado. El arreglo de verdad es
 * que el formulario pregunte; queda anotado en `criterio-clinico.md`, apartado
 * "Qué trae el registro, y qué está inventado hoy".
 */
export function fichaDesdePerfil(perfil: PerfilExistente, fecha: string): Ficha {
  let ficha = fichaVacia(perfil.id);

  const poner = (id: string, capa: CapaFicha) => {
    const escrito = registrarReferido(ficha, id, capa);
    if (escrito.ok) ficha = escrito.ficha;
  };

  const base = { fecha, informante: 'paciente' as const };

  // Una fecha de nacimiento con hora tampoco entra: la regla de la casa es
  // texto AAAA-MM-DD, y el perfil viejo guarda las dos formas.
  const nacimientoInventado =
    perfil.creadoEl !== undefined && perfil.dateOfBirth === perfil.creadoEl;
  const nacimientoUsable =
    !nacimientoInventado && perfil.dateOfBirth !== undefined && esFechaValida(perfil.dateOfBirth);

  if (nacimientoUsable) {
    poner('fecha_de_nacimiento', { ...base, estado: 'positivo', valor: perfil.dateOfBirth as string });
  }
  if (!nacimientoInventado && perfil.sex && SEXO[perfil.sex]) {
    poner('sexo_registrado', { ...base, estado: 'positivo', valor: SEXO[perfil.sex] });
  }
  if (typeof perfil.weight === 'number' && perfil.weight > 0) {
    poner('peso', { ...base, estado: 'positivo', valor: perfil.weight });
  }

  const alergias = (perfil.allergies ?? []).map((s) => s.trim()).filter(Boolean);
  if (alergias.length) {
    poner('alergicos', {
      ...base,
      estado: 'positivo',
      detalle: alergias.join(', '),
      // Sin caracterizar: el perfil solo guarda la sustancia.
      alergias: alergias.map((sustancia) => ({ sustancia, manifestaciones: [] })),
    });
  }

  const libres: Array<[string, string | undefined]> = [
    ['farmacologicos', (perfil.medications ?? []).join(', ')],
    ['patologicos', perfil.pathologicalHistory],
    ['quirurgicos', perfil.surgicalHistory],
    ['ginecologicos', perfil.gynecologicalHistory],
    ['familiares', perfil.familyHistory],
  ];
  for (const [id, texto] of libres) {
    if (texto?.trim()) {
      poner(id, { ...base, estado: 'positivo', detalle: texto.trim(), sinEstructurar: true });
    }
  }

  return ficha;
}

// ─────────────────────────────────────────────────────────────
// Lo que el registro tiene que traer
// ─────────────────────────────────────────────────────────────

/**
 * Criterio de Alexander, 8-nov-2026: los usuarios deben quedar registrados con
 * **nombre, edad y los antecedentes pertinentes**.
 *
 * El nombre no está en esta lista porque no es un campo de la ficha: vive en el
 * perfil y el formulario ya lo pide. Lo que sí está es lo que no se puede
 * inferir y de lo que cuelga toda la epidemiología del diseño (§5.1.1): la
 * fecha de nacimiento —de donde sale la edad, que por sí sola descarta
 * condiciones— y el sexo registrado, que no se deduce de un nombre.
 */
export const DATOS_DEL_REGISTRO: readonly string[] = ['fecha_de_nacimiento', 'sexo_registrado'];

/**
 * Los antecedentes que se preguntan en todos los casos, sin importar el motivo
 * (criterio del médico responsable, pregunta 2 de `criterio-clinico.md`):
 * patológicos, quirúrgicos, alérgicos y farmacológicos, y **siempre peso y
 * talla**, porque la gente omite obesidad, gastritis y colon irritable como
 * antecedentes y eso cambia la conducta.
 *
 * Que estén completos es requisito del grafo, no del formulario: pueden venir
 * del registro o irse levantando en la conversación, una pregunta a la vez. Lo
 * que no puede pasar es que el grafo decida sin saber que faltan.
 */
export const ANTECEDENTES_PERTINENTES: readonly string[] = [
  'patologicos',
  'quirurgicos',
  'alergicos',
  'farmacologicos',
  'peso',
  'talla',
];

/**
 * Lo que el registro debía traer y no está. Lista vacía: la ficha tiene lo
 * mínimo para que el grafo estratifique sin suponer nada.
 */
export function faltanDatosDelRegistro(ficha: Ficha): string[] {
  return DATOS_DEL_REGISTRO.filter((id) => estadoVigente(ficha, id) !== 'positivo');
}

/**
 * Antecedentes universales que nadie ha preguntado todavía. Un `negado` o un
 * `desconocido` **no** cuentan como faltantes: son respuestas, y lo que esta
 * función busca son los huecos.
 */
export function faltanAntecedentesPertinentes(ficha: Ficha): string[] {
  return ANTECEDENTES_PERTINENTES.filter((id) => estadoVigente(ficha, id) === 'no_preguntado');
}

// ─────────────────────────────────────────────────────────────
// Lo que la ficha le entrega al grafo
// ─────────────────────────────────────────────────────────────

/**
 * Los hallazgos que salen de la ficha, con procedencia `ficha` y temporalidad
 * `antecedente`. Es la interfaz con el ejecutor (paso 3).
 *
 * Solo salen los campos tipados que son también hallazgos: el texto libre
 * `sinEstructurar` **no** se convierte en hallazgos, porque partirlo sería
 * inferir. Se añade el IMC cuando peso y talla están los dos, y solo entonces.
 */
export function hallazgosDeLaFicha(ficha: Ficha, fecha: string): HallazgoRegistrado[] {
  const salida: HallazgoRegistrado[] = [];

  for (const def of CAMPOS_FICHA) {
    if (!def.hallazgo) continue;
    const campo = ficha.campos[def.id];
    const capa = capaVigente(campo);
    if (!capa || capa.sinEstructurar) continue;
    const hallazgo = definicion(def.hallazgo);
    if (!hallazgo) continue;

    const h: HallazgoRegistrado = {
      id: def.hallazgo,
      estado: capa.estado,
      procedencia: 'ficha',
      fecha: capa.fecha,
      temporalidad: 'antecedente',
    };
    if (capa.estado === 'positivo' && hallazgo.tipo.clase !== 'presencia' && capa.valor !== undefined) {
      h.valor = capa.valor;
    }
    if (capa.razon) h.razon = capa.razon;
    salida.push(h);
  }

  const nacimiento = valorVigente(ficha, 'fecha_de_nacimiento');
  const meses = edadEnMeses(typeof nacimiento === 'string' ? nacimiento : undefined, fecha);
  if (meses !== null) {
    salida.push({
      id: 'edad_meses',
      estado: 'positivo',
      valor: meses,
      procedencia: 'ficha',
      fecha,
      temporalidad: 'antecedente',
    });
  }

  const peso = valorVigente(ficha, 'peso');
  const talla = valorVigente(ficha, 'talla');
  const calculado = imc(
    typeof peso === 'number' ? peso : undefined,
    typeof talla === 'number' ? talla : undefined
  );
  if (calculado !== null) {
    salida.push({
      id: 'imc',
      estado: 'positivo',
      valor: calculado,
      procedencia: 'calculo',
      fecha,
      temporalidad: 'antecedente',
    });
  }

  return salida;
}

/**
 * Lo que la ficha no sabe, para el informe. "Lo que quedó sin preguntar" es una
 * sección del informe (§9), no un detalle: el médico que recibe el caso
 * necesita distinguir un negativo registrado de un hueco.
 */
export function huecosDeLaFicha(ficha: Ficha, curso?: CursoDeVida): string[] {
  const candidatos = curso ? camposDelCurso(curso) : CAMPOS_FICHA;
  return candidatos.filter((c) => estadoVigente(ficha, c.id) === 'no_preguntado').map((c) => c.id);
}
