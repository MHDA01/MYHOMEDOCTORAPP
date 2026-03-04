'use server';

/**
 * Server Action: Teleorientación — Orientación Médica Familiar Empática
 *
 * Usa Genkit + Gemini 1.5 Pro (ventana de contexto amplia) para respuestas
 * clínicamente contextualizadas por paciente individual.
 *
 * Regla absoluta: el modelo nunca recibe ni da respuestas genéricas.
 * Cada turno lleva un bloque [CONTEXTO DEL PACIENTE] oculto para el usuario.
 */

import { ai } from '@/ai/genkit';
import type { IdpExtracted } from '@/lib/types';

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface TeleorientacionMessage {
  role: 'user' | 'model';
  content: string;
}

export interface LabResult {
  estudio?: string;
  resultados?: Array<{
    parametro: string;
    valor: string;
    referencia?: string;
    interpretacion?: string;
  }>;
  conclusion_general?: string;
}

export interface TeleorientacionPatientContext {
  fullName: string;
  age?: number;
  sex?: string;
  weight?: number;
  allergies?: string[];
  medications?: string[];
  pathologicalHistory?: string;
  surgicalHistory?: string;
  gynecologicalHistory?: string;
  /** Últimos documentos procesados por IDP (idpStatus === 'done') */
  lastLabResults?: LabResult[];
}

export interface SendOrientacionMessageInput {
  patientContext: TeleorientacionPatientContext;
  userMessage: string;
  conversationHistory: TeleorientacionMessage[];
}

export interface SendOrientacionMessageOutput {
  response: string;
  success: boolean;
  error?: string;
}

// ── System Prompt maestro (Instrucción maestra del usuario) ──────────────────

const SYSTEM_PROMPT = `Eres el Asistente de Orientación Médica de MyHomeDoctorApp. Tu tono es empático, cálido y tranquilizador.

REGLAS INQUEBRANTABLES:
1. ESTÁ ESTRICTAMENTE PROHIBIDO DAR RESPUESTAS GENÉRICAS. Para cada consulta, recibirás un bloque de [CONTEXTO DEL PACIENTE]. Debes basar toda tu orientación, advertencias y tono en su edad, sexo, alergias, antecedentes y laboratorios específicos.
2. Hazle saber al usuario sutilmente que tienes en cuenta este contexto (Ej: "Teniendo en cuenta que María es hipertensa...", "Como Juan es alérgico a los AINES...").
3. NUNCA diagnostiques ni recetes medicamentos.
4. Si los síntomas cruzados con los antecedentes representan un riesgo, o si el paciente requiere evaluación clínica, sugiere con mucha empatía agendar una teleconsulta con el Dr. Alexander García. Nunca uses la palabra "Triaje".`;

// ── Construcción del bloque de contexto oculto ───────────────────────────────

function buildContextBlock(patient: TeleorientacionPatientContext): string {
  const sexLabel =
    patient.sex === 'male' ? 'Masculino' :
    patient.sex === 'female' ? 'Femenino' : 'No especificado';

  const allergiesText =
    patient.allergies?.length
      ? patient.allergies.join(', ')
      : 'Sin alergias conocidas';

  const medicationsText =
    patient.medications?.length
      ? patient.medications.join(', ')
      : 'Sin medicamentos registrados';

  const labResultsText =
    patient.lastLabResults?.length
      ? JSON.stringify(patient.lastLabResults, null, 2)
      : 'Sin resultados de laboratorio procesados';

  return [
    `[CONTEXTO DEL PACIENTE]`,
    `Nombre: ${patient.fullName}`,
    `Edad: ${patient.age ?? 'No especificada'} años`,
    `Sexo: ${sexLabel}`,
    `Peso: ${patient.weight ? `${patient.weight} kg` : 'No especificado'}`,
    `Alergias: ${allergiesText}`,
    `Antecedentes Patológicos: ${patient.pathologicalHistory || 'Sin antecedentes registrados'}`,
    `Antecedentes Quirúrgicos: ${patient.surgicalHistory || 'Sin antecedentes registrados'}`,
    patient.gynecologicalHistory
      ? `Antecedentes Gineco-obstétricos: ${patient.gynecologicalHistory}`
      : null,
    `Medicamentos Actuales: ${medicationsText}`,
    `Últimos laboratorios procesados (IDP): ${labResultsText}`,
    `[FIN CONTEXTO]`,
  ]
    .filter(Boolean)
    .join('\n');
}

// ── Server Action principal ──────────────────────────────────────────────────

export async function sendOrientacionMessage(
  input: SendOrientacionMessageInput,
): Promise<SendOrientacionMessageOutput> {
  // Validación temprana: evita llamar a la AI si la clave no está configurada
  const apiKey = process.env.GOOGLE_GENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'TU_API_KEY_AQUI') {
    return {
      response: '',
      success: false,
      error:
        'La clave de Google AI (GOOGLE_GENAI_API_KEY) no está configurada. ' +
        'Agrégala en tu archivo .env.local y reinicia el servidor.',
    };
  }

  try {
    const contextBlock = buildContextBlock(input.patientContext);

    // El mensaje enviado al modelo lleva el contexto oculto como prefijo
    const messageWithContext = `${contextBlock}\n\n[PREGUNTA DEL USUARIO]: ${input.userMessage}`;

    const historyMessages = input.conversationHistory.map((m) => ({
      role: m.role as 'user' | 'model',
      content: [{ text: m.content }],
    }));

    const response = await ai.generate({
      model: 'googleai/gemini-1.5-pro',
      system: SYSTEM_PROMPT,
      messages: [
        ...historyMessages,
        { role: 'user' as const, content: [{ text: messageWithContext }] },
      ],
    });

    return { response: response.text, success: true };
  } catch (error: any) {
    console.error('[sendOrientacionMessage] Error:', error);
    return {
      response: '',
      success: false,
      error: error?.message ?? 'Error desconocido al contactar la IA',
    };
  }
}
