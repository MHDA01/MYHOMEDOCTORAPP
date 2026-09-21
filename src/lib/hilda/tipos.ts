/**
 * Tipos del motor de agentes de la Dra. Hilda.
 *
 * Reparto de trabajo: la IA lee y redacta; las decisiones clínicas de ruta
 * (derivar a urgencias, seguir preguntando, orientar) las toma código que se
 * puede probar y auditar (centinela.ts).
 */

/** Un signo de alarma que el centinela vigila en cada turno. */
export interface SignoDeAlarma {
  id: string;
  /** Texto aprobado, en lenguaje para el paciente. */
  texto: string;
  origen: 'universal' | 'protocolo';
  /** Guía de la que sale, cuando viene de un protocolo publicado. */
  fuente?: string | null;
  /**
   * Frases que, si aparecen en el mensaje, obligan a aclarar el signo aunque la
   * IA que lee la conversación falle. Solo los signos universales las tienen.
   */
  palabrasClave?: RegExp[];
}

/** Pregunta que el protocolo manda hacer antes de orientar. */
export interface PreguntaClave {
  id: string;
  texto: string;
}

/** Frase aprobada de un protocolo publicado. */
export interface FraseProtocolo {
  id: string;
  seccion: string | null;
  texto: string;
  fuente: string;
}

/** Protocolo publicado y activado para la Dra. Hilda. */
export interface ProtocoloActivo {
  motivoId: string;
  motivo: string;
  edad: string;
  cursoDeVida: string;
  version: number;
  signos: SignoDeAlarma[];
  preguntas: PreguntaClave[];
  frases: FraseProtocolo[];
  /** Nombre corto de cada guía para citarla ante el paciente. */
  nombresFuentes: Record<string, string>;
}

export type EstadoSigno = 'presente' | 'posible' | 'ausente' | 'sin_dato';

export interface SignoLeido {
  id: string;
  estado: EstadoSigno;
  /** Frase del paciente en la que se apoya la lectura. */
  evidencia: string | null;
  /** true si la evidencia aparece literal en lo que escribió el paciente. */
  evidenciaVerificada: boolean;
}

/** Lo que el agente lector sacó de la conversación en este turno. */
export interface Lectura {
  motivoId: string | null;
  edadAnios: number | null;
  signos: SignoLeido[];
  preguntasRespondidas: string[];
}

export type Fase = 'derivacion_urgente' | 'entrevista' | 'orientacion' | 'sin_protocolo';

export interface Decision {
  fase: Fase;
  /** Signos que obligan a derivar en este turno. */
  disparados: SignoDeAlarma[];
  /** Signos por aclarar (posibles o sin dato), en orden de prioridad. */
  signosPorAclarar: SignoDeAlarma[];
  preguntasPendientes: PreguntaClave[];
  /** Por qué se decidió así: queda en la traza. */
  razon: string;
}

/** Estado de la consulta entre turnos. Vive en una ruta que el teléfono no puede leer ni escribir. */
export interface EstadoConsulta {
  motivoId: string | null;
  protocoloVersion: number | null;
  turnosDeEntrevista: number;
  alarmaActivada: boolean;
  /** Última lectura de cada signo (id → estado). */
  signos: Record<string, EstadoSigno>;
  preguntasRespondidas: string[];
}

export const ESTADO_INICIAL: EstadoConsulta = {
  motivoId: null,
  protocoloVersion: null,
  turnosDeEntrevista: 0,
  alarmaActivada: false,
  signos: {},
  preguntasRespondidas: [],
};
