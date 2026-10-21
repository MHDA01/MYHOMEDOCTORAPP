/**
 * Resumen de una consulta de teleorientación para el médico.
 *
 * El médico no lee el chat crudo: lee esto. Por eso el resumen es un objeto con
 * forma fija (no texto libre): así la bandeja puede ordenar por gravedad, la
 * tarjeta siempre muestra lo mismo en el mismo sitio y se puede probar que una
 * señal de alarma no se pierde entre la conversación y la pantalla.
 *
 * Sustituye a `medical-handoff-types.ts`, que se escribió en su día y nunca se
 * conectó a nada.
 *
 * Nada de lo que hay aquí habla con Firestore ni con la red: son tipos y reglas
 * puras, para poder probarlas sin emulador.
 */

import { z } from 'zod';

/** Versión del prompt y del esquema. Cambia cuando cambie lo que se le pide al modelo. */
export const VERSION_RESUMEN = 1;

// ─────────────────────────────────────────────────────────────
// Nivel de atención
// ─────────────────────────────────────────────────────────────

export const NIVELES = ['casa', 'consulta_general', 'consulta_prioritaria', 'urgencias'] as const;
export type NivelAtencion = (typeof NIVELES)[number];

/** De menos a más urgente. Sirve para no bajar nunca un nivel (ver `nivelFinal`). */
const ORDEN_NIVEL: Record<NivelAtencion, number> = {
  casa: 0,
  consulta_general: 1,
  consulta_prioritaria: 2,
  urgencias: 3,
};

export const ETIQUETA_NIVEL: Record<NivelAtencion, string> = {
  casa: 'Manejo en casa',
  consulta_general: 'Consulta médica',
  consulta_prioritaria: 'Consulta prioritaria',
  urgencias: 'Urgencias',
};

export const SEVERIDADES = ['critica', 'alta', 'moderada'] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export const CONFIANZAS = ['alta', 'media', 'baja'] as const;
export type Confianza = (typeof CONFIANZAS)[number];

// ─────────────────────────────────────────────────────────────
// Forma del resumen
// ─────────────────────────────────────────────────────────────

export interface BanderaRoja {
  /** Qué señal es: "Dificultad para respirar". */
  senal: string;
  /** Lo que dijo el paciente, con sus palabras. Es la prueba de que la señal existe. */
  evidencia: string;
  severidad: Severidad;
}

export interface ResumenConsulta {
  /** Motivo de consulta, en una línea. */
  motivo: string;
  /** Tiempo de evolución tal como lo contó el paciente ("3 días", "desde anoche"). */
  evolucion: string;
  /** El relato en dos o tres frases, para leer de un vistazo. */
  relato: string;
  sintomas: { presentes: string[]; negados: string[] };
  banderas: BanderaRoja[];
  /** Antecedentes, alergias y medicamentos que pesan en ESTE caso. */
  antecedentesRelevantes: string[];
  nivel: NivelAtencion;
  /** Por qué ese nivel, en una frase. */
  porQue: string;
  /** Lo que Hilda ya le dijo al paciente, para no contradecirla sin saberlo. */
  orientoHilda: string;
  /** Lo que quedó sin preguntar y haría falta para decidir. */
  sinPreguntar: string[];
  /** Vacío si no la hay: diferencia entre lo que orientó Hilda y lo que sugiere el relato. */
  discrepancia: string;
  confianza: Confianza;
}

export const EsquemaResumenConsulta = z.object({
  motivo: z.string().min(1),
  evolucion: z.string(),
  relato: z.string().min(1),
  sintomas: z.object({
    presentes: z.array(z.string()).default([]),
    negados: z.array(z.string()).default([]),
  }),
  banderas: z
    .array(
      z.object({
        senal: z.string().min(1),
        evidencia: z.string().min(1),
        severidad: z.enum(SEVERIDADES),
      })
    )
    .default([]),
  antecedentesRelevantes: z.array(z.string()).default([]),
  nivel: z.enum(NIVELES),
  porQue: z.string(),
  orientoHilda: z.string(),
  sinPreguntar: z.array(z.string()).default([]),
  discrepancia: z.string().default(''),
  confianza: z.enum(CONFIANZAS),
});

/**
 * Esquema para `responseSchema` de Gemini (subconjunto de OpenAPI que acepta la
 * API). Tiene que decir lo mismo que `EsquemaResumenConsulta`: el de Zod es la
 * red de seguridad por si el modelo se sale del molde.
 */
export const ESQUEMA_GEMINI_RESUMEN: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    motivo: { type: 'STRING' },
    evolucion: { type: 'STRING' },
    relato: { type: 'STRING' },
    sintomas: {
      type: 'OBJECT',
      properties: {
        presentes: { type: 'ARRAY', items: { type: 'STRING' } },
        negados: { type: 'ARRAY', items: { type: 'STRING' } },
      },
      required: ['presentes', 'negados'],
    },
    banderas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          senal: { type: 'STRING' },
          evidencia: { type: 'STRING' },
          severidad: { type: 'STRING', enum: [...SEVERIDADES] },
        },
        required: ['senal', 'evidencia', 'severidad'],
      },
    },
    antecedentesRelevantes: { type: 'ARRAY', items: { type: 'STRING' } },
    nivel: { type: 'STRING', enum: [...NIVELES] },
    porQue: { type: 'STRING' },
    orientoHilda: { type: 'STRING' },
    sinPreguntar: { type: 'ARRAY', items: { type: 'STRING' } },
    discrepancia: { type: 'STRING' },
    confianza: { type: 'STRING', enum: [...CONFIANZAS] },
  },
  required: [
    'motivo',
    'evolucion',
    'relato',
    'sintomas',
    'banderas',
    'antecedentesRelevantes',
    'nivel',
    'porQue',
    'orientoHilda',
    'sinPreguntar',
    'discrepancia',
    'confianza',
  ],
};

// ─────────────────────────────────────────────────────────────
// Reglas que no decide el modelo
// ─────────────────────────────────────────────────────────────

/**
 * Nivel definitivo. El modelo propone, pero una bandera crítica manda a
 * urgencias y una alta no baja de consulta prioritaria, pase lo que pase.
 *
 * Es a propósito que esto no sea negociable: el riesgo de este producto no es
 * mandar de más a urgencias, es que una señal de alarma quede escrita en la
 * tarjeta mientras el titular dice "manejo en casa". El nivel solo puede subir.
 */
export function nivelFinal(propuesto: NivelAtencion, banderas: BanderaRoja[]): NivelAtencion {
  const minimo: NivelAtencion = banderas.some((b) => b.severidad === 'critica')
    ? 'urgencias'
    : banderas.some((b) => b.severidad === 'alta')
      ? 'consulta_prioritaria'
      : 'casa';
  return ORDEN_NIVEL[minimo] > ORDEN_NIVEL[propuesto] ? minimo : propuesto;
}

/** Para ordenar la bandeja: primero lo más grave. */
export function gravedad(nivel: NivelAtencion): number {
  return ORDEN_NIVEL[nivel];
}

/**
 * Aplica el esquema y las reglas a lo que devolvió el modelo.
 * Devuelve null si el JSON no tiene la forma pedida: mejor ningún resumen que
 * uno a medias.
 */
export function resumenDesdeModelo(bruto: unknown): ResumenConsulta | null {
  const leido = EsquemaResumenConsulta.safeParse(bruto);
  if (!leido.success) {
    console.error('[Resumen] El modelo no devolvió la forma pedida:', leido.error.flatten());
    return null;
  }
  const datos = leido.data;
  return { ...datos, nivel: nivelFinal(datos.nivel, datos.banderas) };
}

// ─────────────────────────────────────────────────────────────
// Lo que se le pide al modelo
// ─────────────────────────────────────────────────────────────

export const PROMPT_RESUMEN = `Eres un asistente que prepara, para un médico colombiano, el resumen de una
consulta de teleorientación que atendió Hilda (un personaje creado con IA, no una médica).
El médico va a leer SOLO tu resumen para decidir en menos de un minuto qué hacer
con este paciente. No escribes para el paciente: escribes para un colega.

REGLA PRIMERA — NO INVENTES.
- Solo puedes usar lo que está en la transcripción y en la ficha del paciente que
  te entregan. Nada más.
- Si un dato no aparece, no lo supongas: ponlo en "sinPreguntar".
- "evolucion" se copia de lo que dijo el paciente. Si no lo dijo, escribe
  "no consta" y añádelo a "sinPreguntar".
- En "evidencia" de cada bandera va una cita breve de lo que escribió el paciente,
  con sus palabras, no un resumen tuyo.

QUÉ ES CADA CAMPO.
- motivo: por qué consultó, en una línea y en lenguaje clínico.
- relato: dos o tres frases. Qué le pasa, desde cuándo y cómo va.
- sintomas.presentes: lo que el paciente afirma tener.
- sintomas.negados: lo que el paciente dijo expresamente que NO tiene. Vale mucho
  para el médico: solo pon lo que se negó de verdad, no lo que no se mencionó.
- banderas: señales de alarma CON evidencia en el texto.
    * critica: compromete la vida en horas (dolor torácico, dificultad
      respiratoria importante, signos de ACV, pérdida de consciencia, sangrado
      que no para, ideación suicida, reacción alérgica con compromiso de vía
      aérea, fiebre en un menor de 3 meses, convulsión).
    * alta: necesita ser visto hoy.
    * moderada: hay que vigilarlo.
  Si no hay ninguna, deja la lista vacía. No inventes banderas para quedar bien.
- antecedentesRelevantes: de la ficha y del chat, SOLO lo que cambia la conducta
  en este caso (una alergia al medicamento del que se habla, un embarazo, una
  diabetes en un cuadro infeccioso). No copies la ficha entera.
- nivel: casa | consulta_general | consulta_prioritaria | urgencias.
- porQue: una frase. Qué hace que sea ese nivel y no uno menor.
- orientoHilda: qué le dijo Hilda al paciente, en una o dos frases. El médico
  necesita saberlo para no contradecirla sin darse cuenta.
- sinPreguntar: lo que falta para decidir con tranquilidad. Si no falta nada,
  deja la lista vacía.
- discrepancia: si lo que orientó Hilda se queda corto o se pasa frente a lo que
  cuenta el paciente, dilo en una frase. Si coinciden, cadena vacía.
- confianza: alta si la transcripción alcanza para resumir; media si hay huecos
  importantes; baja si el paciente apenas escribió o el relato es confuso.

TONO: telegráfico, sin adornos, sin saludar, sin recomendar tratamientos ni
medicamentos. No diagnostiques: describes y clasificas. Español de Colombia.

Devuelve únicamente el JSON del esquema.`;

/** El bloque de datos que acompaña al prompt en cada consulta. */
export function entradaParaElModelo(paciente: {
  nombre: string;
  edad?: number;
  sexo?: string;
  alergias: string[];
  medicamentos: string[];
  antecedentes: string[];
}, transcripcion: Array<{ quien: 'paciente' | 'hilda'; texto: string }>): string {
  const ficha = [
    `Nombre: ${paciente.nombre || 'no consta'}`,
    `Edad: ${paciente.edad !== undefined ? `${paciente.edad} años` : 'no consta'}`,
    `Sexo: ${paciente.sexo || 'no consta'}`,
    `Alergias: ${paciente.alergias.length ? paciente.alergias.join(', ') : 'ninguna registrada'}`,
    `Medicamentos: ${paciente.medicamentos.length ? paciente.medicamentos.join(', ') : 'ninguno registrado'}`,
    `Antecedentes: ${paciente.antecedentes.length ? paciente.antecedentes.join(' | ') : 'ninguno registrado'}`,
  ].join('\n');

  const chat = transcripcion
    .map((t) => `${t.quien === 'paciente' ? 'PACIENTE' : 'HILDA'}: ${t.texto}`)
    .join('\n\n');

  return `FICHA DEL PACIENTE\n${ficha}\n\nTRANSCRIPCIÓN DE LA CONSULTA\n${chat}`;
}
