'use server';

/**
 * Server Action: Triaje Inteligente
 * Usa Genkit + Gemini 2.0 Flash para el Dr. García chatbot médico.
 * La API key se lee de la variable de entorno GOOGLE_GENAI_API_KEY.
 */

import { ai } from '@/ai/genkit';

// ── Tipos exportados ─────────────────────────────────────────────────────────

export interface TriageMessage {
  role: 'user' | 'model';
  content: string;
}

export interface TriagePatientContext {
  fullName: string;
  age?: number;
  sex?: string;
  weight?: number;
  allergies?: string[];
  medications?: string[];
  pathologicalHistory?: string;
  surgicalHistory?: string;
  gynecologicalHistory?: string;
}

export interface SendTriageMessageInput {
  patientContext: TriagePatientContext;
  userMessage: string;
  conversationHistory: TriageMessage[];
}

export interface SendTriageMessageOutput {
  response: string;
  success: boolean;
  error?: string;
}

// ── Prompt base del Dr. García ───────────────────────────────────────────────

function buildSystemPrompt(patient: TriagePatientContext): string {
  const sexLabel =
    patient.sex === 'male' ? 'masculino' :
    patient.sex === 'female' ? 'femenino' : 'no especificado';

  const allergiesText =
    patient.allergies?.length
      ? patient.allergies.join(', ')
      : 'Sin alergias conocidas';

  const medicationsText =
    patient.medications?.length
      ? patient.medications.join(', ')
      : 'Sin medicamentos activos';

  return `Eres el Dr. García, un médico general experimentado que trabaja en MyHomeDoctorApp.
Tu rol es realizar un triaje inicial de síntomas para ayudar al paciente a entender su situación
de salud y determinar si necesita atención médica urgente.

DIRECTRICES ESTRICTAS:
1. Sé empático, cálido y profesional. El paciente confía en ti.
2. Recoge información sobre síntomas principales, duración e intensidad.
3. Pregunta sobre síntomas asociados que puedan ser relevantes.
4. NUNCA diagnostiques enfermedades específicas con certeza.
5. SIEMPRE recomienda consultar con un médico en persona para confirmar cualquier evaluación.
6. Si los síntomas son graves (fiebre >39 °C, dificultad respiratoria, dolor torácico, pérdida de conciencia, sangrado severo), indica urgencia inmediata.
7. Proporciona orientación general de primeros auxilios cuando sea apropiado.
8. Responde siempre en español, de forma concisa y centrada en recopilar información relevante.
9. Llama al paciente por su nombre al inicio y cuando sea natural hacerlo.

DATOS DEL PACIENTE:
- Nombre: ${patient.fullName}
- Edad: ${patient.age ?? 'No especificada'} años
- Sexo: ${sexLabel}
- Peso: ${patient.weight ? `${patient.weight} kg` : 'No especificado'}
- Alergias: ${allergiesText}
- Medicamentos actuales: ${medicationsText}${patient.pathologicalHistory ? `\n- Antecedentes patológicos: ${patient.pathologicalHistory}` : ''}${patient.surgicalHistory ? `\n- Antecedentes quirúrgicos: ${patient.surgicalHistory}` : ''}${patient.gynecologicalHistory ? `\n- Antecedentes gineco-obstétricos: ${patient.gynecologicalHistory}` : ''}

Comienza saludando al paciente por su nombre y pidiéndole que describa los síntomas que presenta hoy.`;
}

// ── Server Action principal ──────────────────────────────────────────────────

export async function sendTriageMessage(
  input: SendTriageMessageInput
): Promise<SendTriageMessageOutput> {
  try {
    const systemPrompt = buildSystemPrompt(input.patientContext);

    // Construir historial en el formato de mensajes de Genkit
    const historyMessages = input.conversationHistory.map((m) => ({
      role: m.role as 'user' | 'model',
      content: [{ text: m.content }],
    }));

    const response = await ai.generate({
      system: systemPrompt,
      messages: [
        ...historyMessages,
        { role: 'user' as const, content: [{ text: input.userMessage }] },
      ],
    });

    return { response: response.text, success: true };
  } catch (error: any) {
    console.error('[sendTriageMessage] Error:', error);
    return {
      response: '',
      success: false,
      error: error?.message ?? 'Error desconocido al contactar la IA',
    };
  }
}
