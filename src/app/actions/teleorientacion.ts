// ============================================================
// app/actions/teleorientacion.ts — Server Action: Dra. Hilda AI
// Conexión directa a Abacus AI (routellm) sin rate-limiting ni pruning.
// Versión estable restaurada (rollback quirúrgico).
// ============================================================
'use server';

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */
export interface TeleorientacionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  imageUrls?: string[];
}

export interface TeleorientacionResponse {
  success: boolean;
  message: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Constantes                                                         */
/* ------------------------------------------------------------------ */
const ABACUS_API_URL = 'https://routellm.abacus.ai/v1/chat/completions';
const MODEL_ID = 'claude-3-5-sonnet-20241022';
const MAX_TOKENS = 2048;
const TEMPERATURE = 0.4;

/**
 * System prompt de la Dra. Hilda.
 * Define su personalidad, límites éticos y protocolo de triage.
 */
const SYSTEM_PROMPT = `SYSTEM PROMPT — Dra. Hilda v2.0 (myhomedoctorapp)

Eres Dra. Hilda, asistente de orientación médica con IA de myhomedoctorapp.
Tu función es orientar, educar y apoyar al paciente sin reemplazar la consulta médica presencial.

════════════════════════════════════════════════════════
## 1. PROTOCOLO DE SALUDO PROACTIVO (PRIORIDAD MÁXIMA)
════════════════════════════════════════════════════════
- SIEMPRE saluda al inicio de cada nueva sesión o conexión, ANTES de que el usuario escriba.
- Verifica si es un nuevo día o una nueva conexión:
    • Nueva conexión (mismo día) → "¡Hola de nuevo, [Nombre]! Aquí estoy. ¿Cómo te sientes?"
    • Nuevo día → "¡Buenos días/tardes/noches, [Nombre]! Un nuevo día para cuidar tu salud. ¿En qué puedo ayudarte hoy?"
    • Primera vez → Saluda calidamente, preséntate como Dra. Hilda y entrega la siguiente explicación de forma empática, clara y estructurada:

      "¡Hola, [Nombre]! Soy la Dra. Hilda, tu asistente de orientación en salud en myhomedoctorapp. Bienvenido/a. Antes de comenzar, quiero contarte brevemente qué es la teleorientación y cómo puedo ayudarte:

      **¿Qué es la teleorientación?**
      La teleorientación es un servicio de salud regulado en Colombia por la Resolución 2654 de 2019 del Ministerio de Salud y Protección Social. Consiste en brindarte orientación, educación en salud, consejería y direccionamiento hacia los centros de atención médica que necesites.

      **¿Qué puedo hacer por ti?**
      - Orientarte sobre síntomas, hábitos saludables y prevención de enfermedades.
      - Educarte con información basada en evidencia científica.
      - Ayudarte a identificar si necesitas consulta médica presencial o de urgencias.
      - Guiarte hacia el nivel de atención adecuado (consulta general, especialista o urgencias).

      **¿Qué NO hago?**
      - No realizo diagnósticos definitivos.
      - No formulo ni prescribo medicamentos (esto está reservado a la telemedicina interactiva, según el Artículo 19 de la Resolución 2654).
      - No ordeno exámenes de laboratorio ni imágenes diagnósticas.
      - No reemplazo la consulta médica presencial.

      **Tu privacidad es importante:**
      Tus datos de salud son tratados como datos sensibles conforme a la Ley 1581 de 2012 de protección de datos personales. Toda nuestra comunicación viaja bajo protocolos seguros.

      Si en algún momento presentas una emergencia, por favor acude a urgencias o llama al 123.

      Estoy aquí para cuidarte. ¿En qué puedo orientarte hoy?"
- El saludo es OBLIGATORIO aunque existan tareas, recordatorios o conversaciones pendientes.
- El factor humano y la calidez son prioridad antes que cualquier tarea pendiente.
- Usa el nombre del usuario si está disponible en el perfil.
- Adapta el saludo a la hora del día (buenos días / buenas tardes / buenas noches).

════════════════════════════════════════════════════════
## 2. ESTÁNDAR DE EVIDENCIA CIENTÍFICA (OBLIGATORIO)
════════════════════════════════════════════════════════
- Trabajas EXCLUSIVAMENTE con Medicina Basada en la Evidencia (MBE).
- Solo emites recomendaciones respaldadas por niveles de evidencia Ia, Ib o IIa
  según la clasificación Oxford Centre for Evidence-Based Medicine (OCEBM) y el sistema GRADE:

    • Ia  → Metaanálisis de ensayos clínicos aleatorizados y controlados (ECA).
              Ejemplo: revisiones Cochrane, metaanálisis de NEJM, Lancet, JAMA.
    • Ib  → Al menos un ensayo clínico aleatorizado y controlado bien diseñado.
              Ejemplo: ECA publicado en revista indexada con bajo riesgo de sesgo.
    • IIa → Al menos un estudio controlado bien diseñado sin aleatorización.
              Ejemplo: estudios de cohorte prospectivos, estudios caso-control robustos.

- NO emitas recomendaciones basadas en:
    • Opinión de expertos aislada (nivel IV o V).
    • Consensos informales, anecdóticos o sin respaldo metodológico.
    • Información no verificable o de fuentes no indexadas.

- Si una consulta no tiene respaldo en niveles Ia, Ib o IIa:
    → Indícalo explícitamente: "Sobre este tema la evidencia disponible es limitada o no alcanza el nivel requerido. Te recomiendo consultar con tu médico tratante."
    → Nunca inventes referencias ni cites estudios que no puedas verificar.

- Si el usuario pregunta sobre tus niveles de evidencia, explica el sistema OCEBM/GRADE
  y confirma que solo trabajas con Ia, Ib y IIa.

════════════════════════════════════════════════════════
## 3. ROL, ALCANCE Y LÍMITES CLÍNICOS
════════════════════════════════════════════════════════
- Tu rol es: orientar, educar y realizar triage digital.
- NO diagnosticas enfermedades específicas.
- NO prescribes medicamentos ni dosis.
- NO reemplazas la evaluación clínica presencial, el examen físico ni los estudios paraclínicos.
- Ante signos de alarma o emergencia, responde SIEMPRE:
    "⚠️ Esto requiere atención médica presencial urgente. Por favor acude a urgencias o llama a tu médico de inmediato."
- Signos de alarma que SIEMPRE escalan a urgencias:
    • Dolor torácico, dificultad respiratoria severa, pérdida de consciencia.
    • Signos de ACV (FAST: Face, Arms, Speech, Time).
    • Sangrado activo no controlable, trauma severo.
    • Ideación suicida o crisis de salud mental aguda.

════════════════════════════════════════════════════════
## 4. TONO, ESTILO Y FORMATO DE RESPUESTA
════════════════════════════════════════════════════════
- Lenguaje: claro, empático, profesional y accesible para pacientes no médicos.
- Usa viñetas o numeración para instrucciones paso a paso.
- Cita la fuente o guía de referencia cuando sea relevante:
    Ejemplos: OMS, CDC, AHA, Ministerio de Salud Colombia, guías ACMI, GPC colombianas.
- Responde SIEMPRE en el idioma del usuario (español o inglés según detectes).
- Usa lenguaje probabilístico, nunca certeza absoluta:
    ✅ "La evidencia sugiere..." / "Según las guías actuales..." / "Los estudios muestran..."
    ❌ "Definitivamente tienes..." / "Esto es seguramente..."
- Mantén respuestas concisas pero completas. Evita párrafos largos sin estructura.

════════════════════════════════════════════════════════
## 5. TRANSPARENCIA Y CONFIANZA
════════════════════════════════════════════════════════
- Si no sabes algo, dilo claramente: "No tengo información suficiente sobre esto con el nivel de evidencia requerido."
- Nunca afirmes capacidades que no tienes.
- Recuerda al usuario periódicamente (no en cada mensaje) que eres una herramienta de orientación, no un reemplazo médico.
- Protege la privacidad del usuario: no solicites datos sensibles innecesarios.`;

/* ------------------------------------------------------------------ */
/*  Función principal — Server Action                                  */
/* ------------------------------------------------------------------ */
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR, SUBCOLECCION_CONVERSACIONES } from '@/lib/constants';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';

export interface PatientStructuredContext {
  firstName: string;
  lastName: string;
  age?: number;
  sex?: string;
  allergies?: string[];
  medications?: string[];
}

/**
 * Verifica el Rate Limit del usuario en Firestore.
 * Límite: 20 mensajes cada 60 minutos.
 */
async function checkRateLimit(userId: string): Promise<{ allowed: boolean; remainingWait?: number }> {
  const rateLimitRef = adminDb.collection('rate_limits').doc(userId);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 60 minutos
  const maxRequests = 20;

  return await adminDb.runTransaction(async (transaction) => {
    const doc = await transaction.get(rateLimitRef);
    const data = doc.data();

    if (!doc.exists || (now - data?.windowStart) > windowMs) {
      // Nueva ventana
      transaction.set(rateLimitRef, {
        count: 1,
        windowStart: now,
        lastRequest: now,
      });
      return { allowed: true };
    }

    if (data!.count >= maxRequests) {
      const waitTime = Math.ceil((data!.windowStart + windowMs - now) / (1000 * 60));
      return { allowed: false, remainingWait: waitTime };
    }

    transaction.update(rateLimitRef, {
      count: data!.count + 1,
      lastRequest: now,
    });
    return { allowed: true };
  });
}

/**
 * Persiste un mensaje en Firestore de forma segura (cifrado).
 */
export async function persistSecureMessage(
  userId: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[] }
) {
  const messagesCol = adminDb
    .collection(COLECCION_TUTOR)
    .doc(userId)
    .collection(SUBCOLECCION_CONVERSACIONES)
    .doc(convId)
    .collection('mensajes');

  // Cifrar el contenido del mensaje antes de guardar (V#5)
  const encryptedContent = encryptField(message.content);

  const msgDoc = {
    role: message.role,
    content: encryptedContent,
    imageUrls: message.imageUrls || [],
    timestamp: Timestamp.now(),
    isEncrypted: true, // Flag para saber que este mensaje está cifrado
  };

  await messagesCol.add(msgDoc);

  // Actualizar metadata de la conversación
  await adminDb
    .collection(COLECCION_TUTOR)
    .doc(userId)
    .collection(SUBCOLECCION_CONVERSACIONES)
    .doc(convId)
    .update({
      updatedAt: FieldValue.serverTimestamp(),
      messageCount: FieldValue.increment(1),
    });
}

/**
 * Recupera mensajes de una conversación y los descifra (V#5).
 */
export async function getSecureMessages(idToken: string, convId: string) {
  try {
    const decodedToken = await adminAuth.verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const snap = await adminDb
      .collection(COLECCION_TUTOR)
      .doc(userId)
      .collection(SUBCOLECCION_CONVERSACIONES)
      .doc(convId)
      .collection('mensajes')
      .orderBy('timestamp', 'asc')
      .get();

    return snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        role: data.role,
        content: data.isEncrypted ? decryptField(data.content) : data.content,
        imageUrls: data.imageUrls || [],
        timestamp: data.timestamp.toDate(),
      };
    });
  } catch (error) {
    console.error('[Dra. Hilda] Error recuperando mensajes:', error);
    throw new Error('No se pudieron recuperar los mensajes.');
  }
}

/**
 * Envía el historial de conversación a Abacus AI...
 */
export async function sendTeleorientacionMessage(
  conversationHistory: TeleorientacionMessage[],
  patientContext: PatientStructuredContext,
  idToken: string
): Promise<TeleorientacionResponse> {
  try {
    /* ---- Validación de Autenticación ---- */
    if (!idToken) {
      return {
        success: false,
        message: '',
        error: 'No autenticado. Por favor, inicia sesión de nuevo.',
      };
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(idToken);
    } catch (authError) {
      console.error('[Dra. Hilda] Error de verificación de token:', authError);
      return {
        success: false,
        message: '',
        error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.',
      };
    }

    const userId = decodedToken.uid;

    /* ---- Rate Limiting (V#8) ---- */
    const rateLimit = await checkRateLimit(userId);
    if (!rateLimit.allowed) {
      return {
        success: false,
        message: '',
        error: `Has superado el límite de 20 mensajes por hora. Por favor, espera ${rateLimit.remainingWait} minutos.`,
      };
    }

    /* ---- Validación básica ---- */
    const apiKey = process.env.ABACUS_API_KEY;
    if (!apiKey) {
      console.error('[Dra. Hilda] ABACUS_API_KEY no configurada');
      return {
        success: false,
        message: '',
        error: 'Error de configuración del servidor. Contacta al administrador.',
      };
    }

    if (!conversationHistory.length) {
      return {
        success: false,
        message: '',
        error: 'No se recibió ningún mensaje.',
      };
    }

    /* ---- Construir mensajes para la API ---- */
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    // Inyectar contexto del paciente estructurado (Sanitizado)
    // Nota: El contexto llega ya descifrado (si venía de Firestore) o se maneja en memoria
    const sanitizedPatientInfo = [
      `Nombre: ${patientContext.firstName} ${patientContext.lastName}`,
      patientContext.age !== undefined ? `Edad: ${patientContext.age} años` : null,
      patientContext.sex ? `Sexo: ${patientContext.sex}` : null,
      patientContext.allergies?.length ? `Alergias: ${patientContext.allergies.join(', ')}` : null,
      patientContext.medications?.length ? `Medicamentos: ${patientContext.medications.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    messages.push({
      role: 'system',
      content: `Contexto del paciente actual:\n${sanitizedPatientInfo}`,
    });

    // Agregar historial de conversación (Asegurarse de que el contenido enviado al LLM sea texto plano)
    for (const msg of conversationHistory) {
      // El historial que recibe esta función ya debe estar descifrado si venía de DB
      let content = msg.content;

      if (msg.imageUrls?.length) {
        const imageNote = msg.imageUrls
          .map((url, i) => `[Imagen adjunta ${i + 1}: ${url}]`)
          .join('\n');
        content = `${content}\n\n${imageNote}`;
      }

      messages.push({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content,
      });
    }

    /* ---- Llamada a la API de Abacus AI ---- */
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

    const response = await fetch(ABACUS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        messages,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Sin detalle');
      console.error(`[Dra. Hilda] Error API ${response.status}: ${errorText}`);
      return {
        success: false,
        message: '',
        error: `Error del servicio de IA (${response.status}). Intenta de nuevo en unos segundos.`,
      };
    }

    const data = await response.json();
    const assistantMessage = data.choices?.[0]?.message?.content?.trim() ?? '';

    if (!assistantMessage) {
      return {
        success: false,
        message: '',
        error: 'No se recibió respuesta del asistente. Intenta de nuevo.',
      };
    }

    return {
      success: true,
      message: assistantMessage,
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return {
        success: false,
        message: '',
        error: 'La solicitud tardó demasiado. Verifica tu conexión e intenta de nuevo.',
      };
    }

    console.error('[Dra. Hilda] Error inesperado:', error);
    return {
      success: false,
      message: '',
      error: 'Ocurrió un error inesperado. Intenta de nuevo.',
    };
  }
}

