/**
 * MEDICAL HANDOFF TYPES & ZOD SCHEMAS
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Interfaz de entrega de datos médicos recopilados por el chatbot de Teleorientación.
 * Se estructura para que el médico (en domicilio o urgencias) reciba información clara,
 * estructurada y lista para actuar, sin necesidad de procesar el chat crudo.
 * 
 * ARQUITECTURA:
 * 1. ChatSummary: Extracción limpia del historial
 * 2. RedFlag: Señales de alarma detectadas (clave: visibilidad para médico)
 * 3. MedicalSummaryHandoff: Objeto principal de entrega
 * 4. Validación con Zod para seguridad en runtime
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 RED FLAGS: Señales de Alarma Detectadas
// ─────────────────────────────────────────────────────────────────────────────

export const RedFlagSchema = z.object({
  /** ID único: 'respiratory_distress', 'severe_bleeding', etc. */
  id: z.string().min(1),

  /** Label legible para médico: "Dificultad para respirar", "Sangrado severo" */
  label: z.string().min(1),

  /** Descripción de lo que el paciente reportó (evidencia del chat) */
  evidence: z.string().min(1),

  /** Nivel de severidad: 'critical' = urgencias, 'high' = prioridad, 'moderate' = monitoreo */
  severity: z.enum(['critical', 'high', 'moderate']),

  /** Protocolo que detectó esta alarma (ej: 'ira_respiratorio') */
  linkedProtocol: z.string().optional(),

  /** Turno del chat donde se mencionó (para referencia) */
  chatTurnIndex: z.number().optional(),
});

export type RedFlag = z.infer<typeof RedFlagSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 📋 CHAT SUMMARY: Resumen Estructurado del Historial
// ─────────────────────────────────────────────────────────────────────────────

export const ChatSummarySchema = z.object({
  /** Número total de turnos en la sesión */
  totalTurns: z.number().min(1),

  /** Síntoma principal (lo que disparó la consulta) */
  primarySymptom: z.string().min(1),

  /** Duración reportada del síntoma (ej: "3 días", "2 semanas", "de repente") */
  duration: z.string(),

  /** Intensidad reportada (1-10 si es doloroso, o descripción cualitativa) */
  intensityReport: z.string().optional(),

  /** Protocolo médico que mejor se ajustó al caso */
  matchedProtocol: z.string().optional(),

  /** Score de confianza del RAG (0-10) en la detección del protocolo */
  protocolMatchScore: z.number().min(0).max(10).optional(),

  /** Resumen ejecutivo de lo que pasó en el chat (2-3 oraciones) */
  executiveSummary: z.string(),

  /** Historial crudo (backup completo para auditoría médico-legal) */
  rawChatHistory: z.array(
    z.object({
      role: z.enum(['user', 'model']),
      content: z.string(),
      timestamp: z.date().optional(),
    })
  ),
});

export type ChatSummary = z.infer<typeof ChatSummarySchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 👤 DEMOGRAPHIC INFO: Datos Básicos del Paciente
// ─────────────────────────────────────────────────────────────────────────────

export const DemographicInfoSchema = z.object({
  fullName: z.string().min(1),
  age: z.number().int().min(0).max(150).optional(),
  sex: z.enum(['male', 'female', 'other']).optional(),
  weight: z.number().positive().optional(),

  // Alergias conocidas (crítico para el médico)
  allergies: z.array(z.string()).optional(),

  // Medicamentos actuales (para evitar interacciones)
  currentMedications: z.array(z.string()).optional(),

  // Antecedentes relevantes (resumen ejecutivo)
  pathologicalHistory: z.string().optional(),
  surgicalHistory: z.string().optional(),
  gynecologicalHistory: z.string().optional(),
});

export type DemographicInfo = z.infer<typeof DemographicInfoSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 🎯 MEDICAL SUMMARY HANDOFF: Objeto Principal
// ─────────────────────────────────────────────────────────────────────────────

export const MedicalSummaryHandoffSchema = z.object({
  // Metadatos de la entrega
  handoffId: z.string().min(1).describe('ID único: sess_[timestamp]_[patientId]'),
  createdAt: z.date().describe('Cuándo se generó este handoff'),
  tumorId: z.string().min(1).describe('UID del tutor/familiar que iniciò consulta'),
  patientId: z.string().min(1).describe('UID del paciente'),
  sessionId: z.string().min(1).describe('ID de la sesión de teleorientación'),
  previousHandoffId: z.string().optional(),
  episodeId: z.string().optional(),
  followUpDueAt: z.date().optional(),

  // ─ SECCIÓN 1: DATOS DEL PACIENTE ─
  demographics: DemographicInfoSchema,

  // ─ SECCIÓN 2: RESUMEN DEL CHAT ─
  chatSummary: ChatSummarySchema,

  // ─ SECCIÓN 3: RED FLAGS (crítico para decisión médica) ─
  redFlags: z.array(RedFlagSchema).describe('Señales de alarma detectadas'),

  // ─ SECCIÓN 4: RECOMENDACIÓN DEL SISTEMA ─
  systemRecommendation: z.enum([
    'home_management',      // Manejo en casa con orientación
    'home_monitoring',      // Seguimiento en casa, contacto en 1-2h
    'urgent_teleconsult',   // llamar teleconsulta urgente
    'emergency_referral',   // IR A URGENCIAS AHORA
  ]).describe('Recomendación del sistema para el médico físico'),

  /** Explicación breve de por qué se hace esa recomendación */
  recommendationReason: z.string(),

  // ─ SECCIÓN 5: LABORATORIOS HISTÓRICOS ─
  lastLabResults: z.array(z.record(z.any())).optional().describe('Últimos labs procesados por IDP'),

  // ─ SECCIÓN 6: METADATOS OPERACIONALES ─
  responseFromAI: z.optional(z.string()).describe('Respuesta final de la IA al familiar'),
  handoffDeliveredAt: z.optional(z.date()),
  deliveredToDoctor: z.optional(z.object({
    doctorId: z.string(),
    doctorName: z.string(),
    deliveredAt: z.date(),
  })),
});

export type MedicalSummaryHandoff = z.infer<typeof MedicalSummaryHandoffSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ VALIDATION HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida un objeto contra el schema de MedicalSummaryHandoff
 * Lanza error si no cumple validación
 */
export function validateMedicalHandoff(obj: unknown): MedicalSummaryHandoff {
  return MedicalSummaryHandoffSchema.parse(obj);
}

/**
 * Intentó validar sin lanzar error (útil para logging)
 */
export function tryValidateMedicalHandoff(obj: unknown) {
  const result = MedicalSummaryHandoffSchema.safeParse(obj);
  if (!result.success) {
    console.error('[MedicalHandoff] Validación fallida:', result.error.flatten());
    return null;
  }
  return result.data;
}

// ─────────────────────────────────────────────────────────────────────────────
// 📊 TIPOS AUXILIARES PARA PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resultado del parsing de red flags desde el chat
 * (usado internamente por parseChatToMedicalSummary)
 */
export interface RedFlagDetectionResult {
  flags: RedFlag[];
  hasEmergency: boolean; // true si hay 'critical'
}

/**
 * Opciones para personalizadorr el parseo
 */
export interface ParseChatOptions {
  /** Si true, intentará detectar red flags automáticamente via keywords */
  autoDetectRedFlags?: boolean;

  /** Si false, no incluirá el historial crudo (para GDPR/privacy) */
  includeRawHistory?: boolean;

  /** Timeout para detección de red flags via AI (ms) */
  redFlagDetectionTimeoutMs?: number;

  /** Custom red flag detector function */
  customRedFlagDetector?: (chatHistory: any[], protocols: any) => RedFlag[];
}
