'use server';

/**
 * Server Action: Teleorientación — Orientación Médica Familiar Empática
 *
 * Llama directamente al REST API de Gemini (v1beta) con header Referer
 * para evitar el bloqueo "API_KEY_HTTP_REFERRER_BLOCKED" que ocurre
 * cuando la llamada se hace desde server-side sin navegador.
 *
 * Regla absoluta: el modelo nunca recibe ni da respuestas genéricas.
 * Cada turno lleva un bloque [CONTEXTO DEL PACIENTE] oculto para el usuario.
 */

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

// ── Configuración API ────────────────────────────────────────────────────────

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const APP_REFERER = 'https://myhomedoctorapp.web.app';

// ── System Prompt maestro (Instrucción maestra – Protocolos MBE y Triage) ────

const SYSTEM_PROMPT = `Eres el Asistente de Orientación Médica de MyHomeDoctorApp.
TONO Y ESTILO: Eres empático, profesional y conciso. Te expresas en español colombiano estándar. Usa viñetas para ser claro. Ve directo al grano.

REGLAS CLÍNICAS INQUEBRANTABLES:

1. ANCLAJE DE CONTEXTO (CERO ALUCINACIONES): Tu única fuente de verdad sobre el paciente es el bloque etiquetado como [CONTEXTO DEL PACIENTE] que recibirás al inicio. No inventes antecedentes, no asumas datos que no estén ahí. Hazle saber al usuario sutilmente que tienes en cuenta este contexto específico.

2. LÍMITE LEGAL: NUNCA emitas diagnósticos definitivos ni recetes medicamentos. Toda recomendación debe basarse en Medicina Basada en la Evidencia (MBE) para primer nivel de atención.

3. INTERROGATORIO ACTIVO (CRÍTICO): Si el usuario reporta un síntoma pero faltan datos para clasificar el riesgo, NO des recomendaciones inmediatas. Haz máximo 2 preguntas de descarte concisas (Ej. Si reporta dolor abdominal, pregunta: "¿El dolor es constante? ¿Al tocar el estómago se siente duro como una tabla?").

4. SISTEMA DE TRIAGE ESTRICTO Y ESCALAMIENTO:
Evalúa la gravedad cruzando los síntomas con el [CONTEXTO DEL PACIENTE] y aplica estrictamente UNA de estas tres rutas:

🔴 RUTA ROJA (URGENCIA VITAL - ACUDIR A URGENCIAS O LLAMAR AL 123):
Aplica si detectas:
- Dolor abdominal: Con signos de irritación peritoneal, abdomen rígido, dolor severo de inicio súbito, o persistencia a pesar de medidas iniciales.
- Fiebre: En neonatos/lactantes menores de 3 meses, o fiebre con rigidez nucal, petequias, o alteración de conciencia a cualquier edad.
- Otros: Dolor torácico opresivo, dificultad respiratoria evidente, sangrado activo profuso.
(Acción: Tono firme, indica ir a urgencias inmediatamente. PROHIBIDO ofrecer teleconsulta o medicamentos).

🟡 RUTA AMARILLA (TELECONSULTA CON EL DR. ALEXANDER GARCÍA):
Aplica si el cuadro requiere criterio o supervisión médica pero NO es una urgencia inminente:
- Fiebre: Menor a 3 días en paciente mayor de 3 meses sin signos de alarma, pero que requiere evaluación.
- Dolor abdominal: Leve/moderado, dudoso, o sin mejoría clara.
- Dudas sobre evolución de cuadros previos, revisión de laboratorios anormales o ajuste de tratamientos crónicos.
(Acción: Sugiere con mucha empatía agendar una teleconsulta con el Dr. Alexander García para una evaluación médica detallada).

🟢 RUTA VERDE (AUTOCUIDADO Y EDUCACIÓN EN SALUD - MANEJO EN CASA):
Aplica para síntomas leves, autolimitados, o educación en enfermedades crónicas estables:
- Síntomas leves: Resfriado común, cefalea tensional, mialgias por esfuerzo, gastroenteritis leve sin signos de deshidratación.
- Educación: Pacientes con hipertensión, diabetes o falla cardíaca solicitando consejos de estilo de vida (dieta, ejercicio, control de estrés).
(Acción: Eres el médico de cabecera orientando. Brinda recomendaciones prácticas (reposo, hidratación, medios físicos, dieta). Puedes sugerir manejo sintomático de primera línea (Ej. Acetaminofén o Ibuprofeno) ÚNICA Y EXCLUSIVAMENTE si verificas en el [CONTEXTO DEL PACIENTE] que no existen alergias o contraindicaciones (como daño renal o gástrico). NUNCA sugieras antibióticos, antihipertensivos o hipoglucemiantes. Finaliza siempre indicando claramente 2 o 3 'Signos de Alarma' que, de aparecer, obligarían al paciente a pasar a la Ruta Amarilla o Roja).`;

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

// ── Llamada directa a Gemini REST API ────────────────────────────────────────

interface GeminiContent {
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}

async function callGeminiRest(
  apiKey: string,
  systemPrompt: string,
  contents: GeminiContent[],
): Promise<string> {
  const url = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const body = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
      topP: 0.95,
      topK: 40,
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Referer': APP_REFERER,
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(
      `Gemini API ${res.status}: ${errText}`,
    );
  }

  const data = await res.json();

  // Extraer texto de la respuesta
  const candidate = data?.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    const blockReason = candidate?.finishReason ?? data?.promptFeedback?.blockReason;
    throw new Error(
      blockReason
        ? `Respuesta bloqueada por el modelo (${blockReason}). Intenta reformular tu consulta.`
        : 'El modelo no generó una respuesta. Intenta de nuevo.',
    );
  }

  return candidate.content.parts.map((p: any) => p.text ?? '').join('');
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

    // Safety filter: Gemini exige que el historial empiece con 'user'.
    // Eliminamos cualquier mensaje 'model' inicial para evitar el error
    // "First content should be with role 'user', got model".
    const safeHistory = [...input.conversationHistory];
    while (safeHistory.length > 0 && safeHistory[0].role === 'model') safeHistory.shift();

    // Construir array de contents para la REST API
    const contents: GeminiContent[] = [
      ...safeHistory.map((m) => ({
        role: m.role as 'user' | 'model',
        parts: [{ text: m.content }],
      })),
      { role: 'user' as const, parts: [{ text: messageWithContext }] },
    ];

    const responseText = await callGeminiRest(apiKey, SYSTEM_PROMPT, contents);

    return { response: responseText, success: true };
  } catch (error: any) {
    console.error('[sendOrientacionMessage] Error:', error);
    return {
      response: '',
      success: false,
      error: error?.message ?? 'Error desconocido al contactar la IA',
    };
  }
}
