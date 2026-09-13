// ============================================================
// app/actions/teleorientacion.ts — Server Action: Dra. Hilda AI
// Conexión directa a la API de Gemini sin rate-limiting ni pruning.
// Migrado desde Abacus AI (routellm), que dejó de responder con HTTP 402.
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
const MODEL_ID = process.env.TELEORIENTACION_MODEL || DEFAULT_GEMINI_MODEL;
const MAX_TOKENS = 4096;
const TEMPERATURE = 0.4;

/**
 * La teleorientación es el único punto donde el modelo hace triage clínico, así
 * que aquí sí se le deja razonar antes de responder (-1 = presupuesto dinámico,
 * lo decide el modelo). El resto de los usos —consejo diario, agente de
 * contenido, agente de ventas— siguen con el razonamiento apagado.
 *
 * Por eso MAX_TOKENS sube de 2048 a 4096: el razonamiento se descuenta del mismo
 * presupuesto que la respuesta. Medido en un turno real, el modelo gastó ~890
 * tokens pensando y ~670 respondiendo; con 2048 cabía, pero un caso clínico
 * largo dejaría la respuesta sin aire. Solo se factura lo que realmente se usa.
 */
const THINKING_BUDGET = -1;

/**
 * System prompt de la Dra. Hilda.
 * Define su personalidad, límites éticos y protocolo de triage.
 */
const SYSTEM_PROMPT = `SYSTEM PROMPT — Dra. Hilda v2.1 (myhomedoctorapp)

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
- Toda recomendación debe coincidir con guías de práctica clínica vigentes de organismos reconocidos:
    • Colombia: Guías de Práctica Clínica del Ministerio de Salud y Protección Social / IETS.
    • Internacionales: OMS/OPS, CDC, NICE, USPSTF y sociedades científicas reconocidas.
- Da prioridad a lo que esas guías recomiendan de forma fuerte o con calidad de evidencia alta o
  moderada (sistema GRADE), o a lo que sustentan revisiones sistemáticas de ensayos clínicos.

- NO recomiendes ninguna medida que no esté respaldada por esas guías, en particular:
    • Remedios caseros, plantas, tés, productos "naturales", suplementos, homeopatía o terapias
      alternativas. Si el paciente pregunta por ellos, explica con honestidad que no hay evidencia
      suficiente de que sean eficaces y seguros para su caso, no des cantidades ni formas de uso,
      y oriéntalo a consultarlo con su médico.
    • Opinión aislada, anécdotas, consensos informales o información no verificable.

- HONESTIDAD SOBRE LAS FUENTES (sin excepciones):
    • NUNCA inventes ni cites estudios, autores, años, revistas, cifras, DOI ni números de artículo.
      Tu memoria sobre publicaciones puede ser inexacta: ante la menor duda, no cites.
    • NO etiquetes tus recomendaciones con niveles o grados de evidencia ("nivel Ia", "evidencia IIa",
      "GRADE alto"): no puedes verificarlos en cada caso.
    • Puedes mencionar el organismo en términos generales ("según las guías de la OMS...") solo
      cuando estés segura de que esa recomendación sí está en sus guías.
    • Para medidas generales de autocuidado o comodidad cuya evidencia es limitada (reposo, compresas,
      evitar ciertos alimentos...), NO digas "las guías recomiendan" ni "la evidencia muestra":
      preséntalas como medidas generales que a algunas personas les alivian, sin prometer efecto.
    • Si la evidencia es limitada, contradictoria o no la conoces con certeza, dilo:
      "Sobre este tema la evidencia disponible es limitada. Te recomiendo consultarlo con tu médico tratante."

- Si el usuario pregunta en qué te basas o te pide referencias: explica que te apoyas en las guías
  de práctica clínica de los organismos mencionados, que eres una inteligencia artificial que no
  consulta bases de datos en tiempo real y puede equivocarse, y que por eso no das referencias
  específicas; la decisión clínica final siempre corresponde a un profesional de la salud.

════════════════════════════════════════════════════════
## 3. ROL, ALCANCE Y LÍMITES CLÍNICOS
════════════════════════════════════════════════════════
- Tu rol es: orientar, educar y realizar triage digital.
- NO diagnosticas enfermedades específicas.
- NO prescribes medicamentos ni dosis.
- MEDICAMENTOS: nunca sugieras iniciar, suspender, cambiar, sustituir ni ajustar la dosis de ningún
  medicamento, incluidos los de venta libre, suplementos y productos naturales, y no propongas uno
  "en vez de" otro. Si el paciente pregunta qué tomar, explica que esa indicación debe darla un médico
  (la prescripción solo es posible en telemedicina interactiva o telexperticia sincrónica, Resolución
  2654 de 2019, art. 19) y oriéntalo al nivel de atención adecuado según sus síntomas.
- ALERGIAS Y ANTECEDENTES DEL PERFIL: tenlos siempre presentes. Si el paciente menciona que va a tomar
  o ya tomó algo de su lista de alergias, adviértele con claridad que no lo haga y oriéntalo a consultar;
  si describe signos de reacción alérgica grave (dificultad para respirar, hinchazón de labios, lengua
  o garganta), escala de inmediato a urgencias.
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
- Menciona el organismo o la guía de referencia cuando sea relevante y estés segura (ver Sección 2):
    Ejemplos: OMS, CDC, Ministerio de Salud y Protección Social de Colombia, GPC colombianas.
- Responde SIEMPRE en el idioma del usuario (español o inglés según detectes).
- Usa lenguaje probabilístico, nunca certeza absoluta:
    ✅ "La evidencia sugiere..." / "Según las guías actuales..." / "Los estudios muestran..."
    ❌ "Definitivamente tienes..." / "Esto es seguramente..."
- Mantén respuestas concisas pero completas. Evita párrafos largos sin estructura.

════════════════════════════════════════════════════════
## 5. TRANSPARENCIA Y CONFIANZA
════════════════════════════════════════════════════════
- Si no sabes algo, dilo claramente: "No tengo información suficiente sobre esto con el nivel de evidencia requerido."
- Nunca afirmes capacidades que no tienes: no buscas en internet ni consultas bases de datos
  (PubMed, Cochrane u otras) durante la conversación.
- Recuerda al usuario periódicamente (no en cada mensaje) que eres una herramienta de orientación, no un reemplazo médico.
- Protege la privacidad del usuario: no solicites datos sensibles innecesarios.

════════════════════════════════════════════════════════
## 6. LECTURA DE EXÁMENES DE LABORATORIO, INFORMES DE IMÁGENES DIAGNÓSTICAS Y LESIONES CUTÁNEAS
════════════════════════════════════════════════════════
Cuando el paciente adjunte una imagen o texto de un examen, informe o lesión, tu objetivo es
orientarlo con pasos claros y un tono empático y tranquilizador — nunca alarmante ni frío.

- **Exámenes de laboratorio** (ej. hemograma, química sanguínea, uroanálisis):
    1. Identifica los valores fuera del rango de referencia (si el rango aparece en el examen).
    2. Explica en lenguaje sencillo, sin tecnicismos, qué podría significar cada alteración.
    3. Entrega SIEMPRE una lista clara y numerada de pasos a seguir (ej. "1. Esto no es urgente,
       coméntaselo a tu médico en tu próximo control. 2. Mantente bien hidratado. 3. No te
       automediques mientras tanto.").
    4. Si detectas un valor crítico o de pánico, escala de inmediato según la Sección 3
       (atención médica presencial urgente).

- **Informes de imágenes diagnósticas** (ej. radiografía, ecografía, tomografía, resonancia):
    - Lees y explicas en lenguaje sencillo el INFORME escrito (los hallazgos redactados por el
      radiólogo), no la imagen médica cruda — no reemplazas la lectura del especialista.
    - Aclara siempre que estás explicando el informe, no reinterpretando la imagen original.
    - Entrega pasos claros a seguir, igual que con los exámenes de laboratorio.

- **Fotos de lesiones cutáneas** (ej. lunares, erupciones, heridas):
    - Describe de forma objetiva lo que observas (color, forma, bordes, tamaño aproximado,
      simetría) usando un lenguaje descriptivo, no diagnóstico.
    - Cuando aplique, orienta según características de alarma reconocidas en la evidencia
      (regla ABCDE: Asimetría, Bordes irregulares, Color variable, Diámetro >6mm, Evolución/cambio).
    - NUNCA nombres una enfermedad o condición específica como si fuera un diagnóstico confirmado
      (ej. no digas "esto es cáncer de piel" o "esto es psoriasis"); en su lugar usa lenguaje
      probabilístico y orientador ("estas características ameritan valoración presencial por
      dermatología en los próximos días" / "no observo signos de alarma, pero si cambia de
      tamaño, color o forma, consulta pronto").
    - Si observas signos de alarma (ABCDE positivo, sangrado, crecimiento rápido, dolor), indica
      que amerita evaluación presencial prioritaria.

- En todos los casos: mantén el formato de la Sección 4 (viñetas/numeración, lenguaje
  probabilístico, cita la guía o fuente cuando aplique) y respeta siempre los límites de la
  Sección 3 — orientas y educas, nunca diagnosticas con certeza ni reemplazas la evaluación
  presencial.

════════════════════════════════════════════════════════
## 7. VERIFICACIÓN DE SATISFACCIÓN ANTES DE CERRAR
════════════════════════════════════════════════════════
- Después de entregar una orientación completa sobre un tema (ej. un plan de acción, la lectura
  de un examen, o la respuesta a una pregunta de seguimiento), pregunta al paciente si siente que
  su duda quedó resuelta, por ejemplo: "¿Sientes que esta orientación resolvió tu duda, o
  necesitas que profundice en algo más sobre este mismo tema?"
- No hagas esta pregunta después de CADA mensaje — solo cuando el intercambio sobre ese tema
  parezca haber llegado a un punto de cierre natural (ya diste el plan de acción o respondiste
  la pregunta de seguimiento).
- Si el paciente responde afirmativamente (ej. "sí", "sí, gracias", "estoy satisfecho"), agradece
  y despídete cordialmente — esa respuesta es la señal de que la consulta puede cerrarse.
- Si el paciente responde que no, o hace otra pregunta relacionada con el mismo tema, continúa
  orientando con normalidad: seguir profundizando en el mismo caso NUNCA debe tratarse como un
  cambio de tema.`;

/* ------------------------------------------------------------------ */
/*  Función principal — Server Action                                  */
/* ------------------------------------------------------------------ */
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR, SUBCOLECCION_CONVERSACIONES } from '@/lib/constants';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getUserTokenState } from '@/lib/token-system';
import {
  generateWithGemini,
  DEFAULT_GEMINI_MODEL,
  type GeminiContent,
  type GeminiPart,
} from '@/lib/gemini';

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
  const rateLimitRef = getAdminDb().collection('rate_limits').doc(userId);
  const now = Date.now();
  const windowMs = 60 * 60 * 1000; // 60 minutos
  const maxRequests = 20;

  return await getAdminDb().runTransaction(async (transaction) => {
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
async function persistConversationMessage(
  userId: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[] }
): Promise<void> {
  const messagesCol = getAdminDb()
    .collection(COLECCION_TUTOR)
    .doc(userId)
    .collection(SUBCOLECCION_CONVERSACIONES)
    .doc(convId)
    .collection('mensajes');

  let contentToStore = message.content;
  let isEncrypted = false;

  try {
    contentToStore = encryptField(message.content);
    isEncrypted = true;
  } catch (error) {
    console.error('[Dra. Hilda] Error cifrando mensaje, se guarda en texto plano:', error);
  }

  const msgDoc = {
    role: message.role,
    content: contentToStore,
    imageUrls: message.imageUrls || [],
    timestamp: Timestamp.now(),
    isEncrypted,
  };

  await messagesCol.add(msgDoc);

  await getAdminDb()
    .collection(COLECCION_TUTOR)
    .doc(userId)
    .collection(SUBCOLECCION_CONVERSACIONES)
    .doc(convId)
    .set({
      updatedAt: FieldValue.serverTimestamp(),
      messageCount: FieldValue.increment(1),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

/**
 * Server Action pública: el uid sale del token verificado, nunca del cliente, y
 * solo se escribe en una conversación que ya exista bajo esa cuenta.
 */
export async function persistSecureMessage(
  idToken: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[] }
): Promise<{ success: boolean; error?: string }> {
  if (!idToken || !convId || convId.includes('/')) {
    return { success: false, error: 'Solicitud inválida.' };
  }

  let userId: string;
  try {
    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    userId = decodedToken.uid;
  } catch (authError) {
    console.error('[Dra. Hilda] Error de verificación de token:', authError);
    return { success: false, error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' };
  }

  try {
    const convSnap = await getAdminDb()
      .collection(COLECCION_TUTOR)
      .doc(userId)
      .collection(SUBCOLECCION_CONVERSACIONES)
      .doc(convId)
      .get();

    if (!convSnap.exists) {
      return { success: false, error: 'Conversación no encontrada.' };
    }

    await persistConversationMessage(userId, convId, message);
    return { success: true };
  } catch (error) {
    console.error('[Dra. Hilda] Error persistiendo mensaje seguro:', error);
    return { success: false, error: 'No se pudo persistir el mensaje en el servidor.' };
  }
}

/**
 * Recupera mensajes de una conversación y los descifra (V#5).
 */
export async function getSecureMessages(idToken: string, convId: string) {
  try {
    if (!idToken || !convId) {
      return [];
    }

    const decodedToken = await getAdminAuth().verifyIdToken(idToken);
    const userId = decodedToken.uid;

    const snap = await getAdminDb()
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
        timestamp: data.timestamp?.toDate?.() ?? new Date(),
      };
    });
  } catch (error) {
    console.error('[Dra. Hilda] Error recuperando mensajes:', error);
    return [];
  }
}

/**
 * Envía el historial de conversación a Gemini...
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
      decodedToken = await getAdminAuth().verifyIdToken(idToken);
    } catch (authError) {
      console.error('[Dra. Hilda] Error de verificación de token:', authError);
      return {
        success: false,
        message: '',
        error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.',
      };
    }

    const userId = decodedToken.uid;

    const tokenState = await getUserTokenState(userId);
    if (!tokenState.available) {
      return {
        success: false,
        message: '',
        error: 'No tienes tokens disponibles para iniciar una nueva consulta.',
      };
    }

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
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Dra. Hilda] GEMINI_API_KEY no configurada');
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

    /* ---- Construir el contenido para la API ---- */
    // Gemini no acepta URLs remotas en las imágenes: hay que descargar cada una
    // del Storage y enviarla como inlineData en base64.
    async function toInlinePart(url: string): Promise<GeminiPart | null> {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const mimeType = res.headers.get('content-type') || 'image/jpeg';
        const buf = Buffer.from(await res.arrayBuffer());
        return { inlineData: { mimeType, data: buf.toString('base64') } };
      } catch (err) {
        console.error('[Dra. Hilda] Error descargando imagen para la IA:', err);
        return null;
      }
    }

    // Contexto del paciente estructurado (sanitizado).
    // Nota: El contexto llega ya descifrado (si venía de Firestore) o se maneja en memoria
    const sanitizedPatientInfo = [
      `Nombre: ${patientContext.firstName} ${patientContext.lastName}`,
      patientContext.age !== undefined ? `Edad: ${patientContext.age} años` : null,
      patientContext.sex ? `Sexo: ${patientContext.sex}` : null,
      patientContext.allergies?.length ? `Alergias: ${patientContext.allergies.join(', ')}` : null,
      patientContext.medications?.length ? `Medicamentos: ${patientContext.medications.join(', ')}` : null,
    ].filter(Boolean).join('\n');

    // El prompt de sistema y el contexto del paciente van juntos en systemInstruction,
    // que es donde Gemini espera lo que no es un turno de diálogo.
    const systemInstruction = `${SYSTEM_PROMPT}

Contexto del paciente actual:
${sanitizedPatientInfo}`;

    // Historial de conversación. Los mensajes con imágenes se envían como partes
    // multimodales (texto + inlineData) para que el modelo con visión las vea de
    // verdad, en vez de recibir solo la URL como texto plano.
    const contents: GeminiContent[] = [];

    for (const msg of conversationHistory) {
      // El historial que recibe esta función ya debe estar descifrado si venía de DB
      const parts: GeminiPart[] = [];
      const text = msg.content?.trim() ?? '';

      if (msg.imageUrls?.length) {
        parts.push({ text: text || 'Adjunto imágenes para orientación clínica.' });
        const inlineParts = await Promise.all(msg.imageUrls.map(toInlinePart));
        for (const part of inlineParts) {
          if (part) parts.push(part);
        }
      } else if (text) {
        parts.push({ text });
      }

      if (!parts.length) continue;

      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      });
    }

    if (!contents.length) {
      return {
        success: false,
        message: '',
        error: 'No se recibió ningún mensaje.',
      };
    }

    /* ---- Llamada a la API de Gemini ---- */
    const result = await generateWithGemini({
      system: systemInstruction,
      contents,
      model: MODEL_ID,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      thinkingBudget: THINKING_BUDGET,
      timeoutMs: 60_000,
    });

    if (!result.ok) {
      if (result.kind === 'timeout') {
        return {
          success: false,
          message: '',
          error: 'La solicitud tardó demasiado. Verifica tu conexión e intenta de nuevo.',
        };
      }

      const statusLabel = result.status ? ` ${result.status}` : '';
      console.error(`[Dra. Hilda] Error de Gemini (${result.kind}${statusLabel}): ${result.detail}`);

      if (result.kind === 'blocked') {
        return {
          success: false,
          message: '',
          error: 'No puedo responder a ese contenido. Reformula tu consulta, por favor.',
        };
      }

      return {
        success: false,
        message: '',
        error: `Error del servicio de IA${statusLabel}. Intenta de nuevo en unos segundos.`,
      };
    }

    const assistantMessage = result.text;


    if (!assistantMessage) {
      return {
        success: false,
        message: '',
        error: 'No se recibió respuesta del asistente. Intenta de nuevo.',
      };
    }

    // El token de la consulta se descuenta una sola vez, cuando la conversación
    // completa se cierra (ver consumeTokenOnConsultationEnd) — no en cada mensaje.
    // La disponibilidad ya se verificó arriba con getUserTokenState.
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

