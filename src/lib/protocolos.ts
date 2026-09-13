/**
 * Piezas del agente de protocolos que comparten el panel (cliente) y las
 * Server Actions. La generación vive en functions/src/protocolos.
 */

export const COLECCION_PROTOCOLOS_FUENTES = 'protocolos_fuentes';
export const COLECCION_PROTOCOLOS_MOTIVOS = 'protocolos_motivos';
export const COLECCION_PROTOCOLOS_BORRADORES = 'protocolos_borradores';
export const COLECCION_PROTOCOLOS_PUBLICADOS = 'protocolos_publicados';

/** Cursos de vida de la Resolución 3280 de 2018 (Ruta de Promoción y Mantenimiento de la Salud). */
export const CURSOS_DE_VIDA = [
  { id: 'primera_infancia', nombre: 'Primera infancia', rango: '8 días a 5 años' },
  { id: 'infancia', nombre: 'Infancia', rango: '6 a 11 años' },
  { id: 'adolescencia', nombre: 'Adolescencia', rango: '12 a 17 años' },
  { id: 'juventud', nombre: 'Juventud', rango: '18 a 28 años' },
  { id: 'adultez', nombre: 'Adultez', rango: '29 a 59 años' },
  { id: 'vejez', nombre: 'Vejez', rango: '60 años o más' },
] as const;

export type CursoDeVida = (typeof CURSOS_DE_VIDA)[number]['id'];

export function nombreCursoDeVida(id: string): string {
  return CURSOS_DE_VIDA.find((c) => c.id === id)?.nombre ?? id;
}

/** Mismas secciones y en el mismo orden que el redactor (functions/src/protocolos/redactar.ts). */
export const SECCIONES_PROTOCOLO: Array<{ id: string; titulo: string }> = [
  { id: 'preguntas_triage', titulo: 'Preguntas de triage' },
  { id: 'signos_de_alarma', titulo: 'Signos de alarma → urgencias' },
  { id: 'medidas_en_casa', titulo: 'Cuidados en casa' },
  { id: 'cuando_consultar', titulo: 'Cuándo llevar a consulta' },
  { id: 'que_no_hacer', titulo: 'Qué no hacer' },
  { id: 'prevencion', titulo: 'Prevención' },
];

export const RAZONES_EXCLUSION: Record<string, string> = {
  dirigida_a_personal_de_salud: 'Dirigida al personal de salud',
  medicamento_o_dosis: 'Medicamento o dosis (la teleorientación no prescribe)',
  fuera_del_motivo: 'Fuera del motivo de consulta',
  definicion_o_contexto: 'Definición o contexto',
  duplicada: 'Repite otra recomendación',
};

export type EstadoBorrador = 'en_cola' | 'redactando' | 'por_verificar' | 'verificando' | 'listo' | 'error';

export const ESTADOS_EN_PROCESO: EstadoBorrador[] = ['en_cola', 'redactando', 'por_verificar', 'verificando'];

export const NOMBRE_ESTADO: Record<EstadoBorrador, string> = {
  en_cola: 'En cola',
  redactando: 'Redactando (unos 2 minutos)',
  por_verificar: 'Verificando citas',
  verificando: 'Verificando citas y fidelidad',
  listo: 'Listo para revisar',
  error: 'Falló',
};

/** Si un borrador lleva más que esto sin avanzar, la función se detuvo y se puede volver a generar. */
export const MINUTOS_SIN_AVANCE = 20;

export type Decision = 'aprobar' | 'corregir' | 'rechazar';

export interface DecisionItem {
  decision: Decision;
  texto_corregido: string | null;
  nota: string | null;
  por: string;
  en: string;
}

export interface ItemProtocolo {
  id: string;
  rec_id: string;
  fuente: string;
  seccion: string | null;
  texto: string;
  citas_literales: string[];
  cita_literal: string;
  adaptacion: string | null;
  requiere_decision_medica: boolean;
  calificacion_literal: string;
  calificacion_verificada: boolean;
  pagina?: number;
  revisar_fidelidad?: boolean;
  verificacion: { estado: 'verificado' | 'rechazado'; razones: string[]; alertas: string[] };
}

export interface RecomendacionGuia {
  rec_id: string;
  pagina: number;
  calificacion: string;
  texto: string;
  razon?: string;
}

export interface FuenteProtocolo {
  id: string;
  titulo: string;
  entidad: string | null;
  anio: number | null;
  metodologia_calificacion: string | null;
  url: string;
  nota: string | null;
  inventario_total: number | null;
  disponible: boolean;
}

export interface BorradorProtocolo {
  id: string;
  motivo_id: string;
  motivo: { id: string; motivo: string; curso_de_vida: string; edad: string; fuentes: string[] };
  estado: EstadoBorrador;
  error: string | null;
  importado: boolean;
  creado_por: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
  terminado_en: string | null;
  generado: string | null;
  modelo_redactor: string | null;
  modelo_juez: string | null;
  uso_redactor: Record<string, unknown> | null;
  uso_juez: Record<string, unknown> | null;
  metricas: Record<string, number | Record<string, number>> | null;
  vacios: string[];
  items: ItemProtocolo[];
  excluidas: RecomendacionGuia[];
  sin_decision: RecomendacionGuia[];
  partes_no_usadas: Array<{ rec_id: string; pagina: number; calificacion: string; segmentos: string[] }>;
  revision: Record<string, DecisionItem>;
  revision_actualizada_en: string | null;
  publicado_en: string | null;
  publicado_version: number | null;
}
