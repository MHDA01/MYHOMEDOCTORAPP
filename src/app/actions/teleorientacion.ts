// ============================================================
// app/actions/teleorientacion.ts — Server Action: Dra. Hilda AI
// El servidor guarda los mensajes y arma el historial; el teléfono solo manda lo nuevo.
// Migrado desde Abacus AI (routellm), que dejó de responder con HTTP 402.
// ============================================================
'use server';

/* ------------------------------------------------------------------ */
/*  Tipos                                                              */
/* ------------------------------------------------------------------ */
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
/*  Servidor del chat                                                  */
/* ------------------------------------------------------------------ */
import { getAdminAuth, getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import { encryptField, decryptField } from '@/lib/crypto';
import { COLECCION_TUTOR, SUBCOLECCION_CONVERSACIONES } from '@/lib/constants';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import { getUserTokenState } from '@/lib/token-system';
import {
  generateWithGemini,
  DEFAULT_GEMINI_MODEL,
  type GeminiContent,
  type GeminiPart,
  type GeminiResult,
} from '@/lib/gemini';
import {
  conAvisoDeUrgencias,
  IMAGEN_NO_VALIDA,
  MAX_CARACTERES_MENSAJE,
  MAX_IMAGENES_POR_MENSAJE,
  MENSAJE_MUY_LARGO,
} from '@/lib/textos-chat';

export interface PatientStructuredContext {
  firstName: string;
  lastName: string;
  age?: number;
  sex?: string;
  allergies?: string[];
  medications?: string[];
}

/** Límites del historial que se manda a la IA en cada turno. */
const MAX_MENSAJES_HISTORIAL = 40;
/** Solo las fotos de los 2 mensajes más recientes con fotos viajan como imagen. */
const MENSAJES_CON_FOTOS_EN_CONTEXTO = 2;
/** Tope de bytes de imagen por pedido (el límite de Gemini para datos en línea es 20 MB). */
const MAX_BYTES_IMAGENES_POR_PEDIDO = 15 * 1024 * 1024;
const MAX_BYTES_IMAGEN = 10 * 1024 * 1024;

type Resultado = { success: true; message: string } | { success: false; message: ''; error: string };

function fallo(error: string): Resultado {
  return { success: false, message: '', error };
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

function conversacionRef(userId: string, convId: string) {
  return getAdminDb().collection(COLECCION_TUTOR).doc(userId).collection(SUBCOLECCION_CONVERSACIONES).doc(convId);
}

/**
 * Persiste un mensaje cifrado. Si el cifrado falla NO se guarda: un dato de salud
 * nunca debe quedar en texto plano. `sistema` marca los textos que genera la app
 * (errores, cierres de consulta): se muestran en el chat pero no se mandan a la IA.
 */
async function persistConversationMessage(
  userId: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[]; sistema?: boolean }
): Promise<void> {
  const convRef = conversacionRef(userId, convId);

  await convRef.collection('mensajes').add({
    role: message.role,
    content: encryptField(message.content),
    imageUrls: message.imageUrls || [],
    timestamp: Timestamp.now(),
    isEncrypted: true,
    ...(message.sistema ? { origen: 'sistema' } : {}),
  });

  // createdAt lo pone el cliente al crear la conversación; aquí no se toca.
  await convRef.set({
    updatedAt: FieldValue.serverTimestamp(),
    messageCount: FieldValue.increment(1),
  }, { merge: true });
}

/** uid de la sesión, solo si la conversación existe bajo esa cuenta. */
async function sesionConConversacion(idToken: string, convId: string): Promise<{ uid: string } | { error: string }> {
  if (!idToken || !convId || convId.includes('/')) {
    return { error: 'Solicitud inválida.' };
  }
  let uid: string;
  try {
    uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
  } catch (authError) {
    console.error('[Dra. Hilda] Error de verificación de token:', authError);
    return { error: 'Sesión inválida o expirada. Por favor, inicia sesión de nuevo.' };
  }
  const conversacion = await conversacionRef(uid, convId).get();
  if (!conversacion.exists) {
    return { error: 'Conversación no encontrada.' };
  }
  return { uid };
}

/**
 * Server Action pública para los textos que genera la app (errores y cierres de
 * consulta). El uid sale del token verificado, nunca del cliente.
 */
export async function persistSecureMessage(
  idToken: string,
  convId: string,
  message: { role: string; content: string; imageUrls?: string[]; sistema?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const sesion = await sesionConConversacion(idToken, convId);
  if ('error' in sesion) return { success: false, error: sesion.error };

  try {
    await persistConversationMessage(sesion.uid, convId, message);
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

    const snap = await conversacionRef(userId, convId)
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
 * Traduce la URL de descarga de una foto del chat a su ruta en Storage, solo si
 * es del bucket de la app y de la carpeta de esta conversación. Así el servidor
 * nunca descarga direcciones arbitrarias que mande el teléfono.
 */
function rutaDeFotoDeLaConsulta(url: string, uid: string, convId: string): string | null {
  let direccion: URL;
  try {
    direccion = new URL(url);
  } catch {
    return null;
  }
  const hostsPermitidos = ['firebasestorage.googleapis.com'];
  if (process.env.FIREBASE_STORAGE_EMULATOR_HOST) hostsPermitidos.push(process.env.FIREBASE_STORAGE_EMULATOR_HOST);
  if (!hostsPermitidos.includes(direccion.host)) return null;

  const partes = direccion.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/);
  if (!partes || partes[1] !== process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET) return null;

  let ruta: string;
  try {
    ruta = decodeURIComponent(partes[2]);
  } catch {
    return null;
  }
  const carpeta = `medical-images/${uid}/${convId}/`;
  if (!ruta.startsWith(carpeta) || ruta.includes('..')) return null;
  return ruta;
}

function archivoDeFoto(ruta: string) {
  return getAdminStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET).file(ruta);
}

/** Tipo de imagen si el archivo existe, es imagen y pesa como máximo 10 MB. */
async function fotoValida(ruta: string): Promise<string | null> {
  try {
    const [metadatos] = await archivoDeFoto(ruta).getMetadata();
    const tamano = Number(metadatos.size ?? 0);
    const tipo = String(metadatos.contentType ?? '');
    return tipo.startsWith('image/') && tamano > 0 && tamano <= MAX_BYTES_IMAGEN ? tipo : null;
  } catch (error) {
    console.error('[Dra. Hilda] Error leyendo foto del chat:', error);
    return null;
  }
}

async function leerFoto(ruta: string): Promise<{ mimeType: string; data: Buffer } | null> {
  const tipo = await fotoValida(ruta);
  if (!tipo) return null;
  try {
    const [data] = await archivoDeFoto(ruta).download();
    return { mimeType: tipo, data };
  } catch (error) {
    console.error('[Dra. Hilda] Error descargando foto del chat:', error);
    return null;
  }
}

/**
 * Arma el historial para la IA desde Firestore (no desde el teléfono): los últimos
 * mensajes, sin los textos de sistema, con las fotos de los mensajes recientes.
 */
async function historialParaLaIA(uid: string, convId: string): Promise<GeminiContent[]> {
  const snap = await conversacionRef(uid, convId)
    .collection('mensajes')
    .orderBy('timestamp', 'desc')
    .limit(MAX_MENSAJES_HISTORIAL)
    .get();

  const contenidos: GeminiContent[] = [];
  let mensajesConFotos = 0;
  let bytesDeFotos = 0;

  // Del más nuevo al más viejo, para que las fotos recientes tengan prioridad.
  for (const doc of snap.docs) {
    const datos = doc.data();
    if (datos.origen === 'sistema') continue;

    let texto: string;
    try {
      texto = (datos.isEncrypted ? decryptField(datos.content) : datos.content)?.trim() ?? '';
    } catch {
      continue;
    }

    const partes: GeminiPart[] = [];
    const urls: string[] = Array.isArray(datos.imageUrls) ? datos.imageUrls : [];

    if (urls.length) {
      partes.push({ text: texto || 'Adjunto imágenes para orientación clínica.' });
      let incluidas = 0;
      if (mensajesConFotos < MENSAJES_CON_FOTOS_EN_CONTEXTO) {
        mensajesConFotos++;
        for (const url of urls.slice(0, MAX_IMAGENES_POR_MENSAJE)) {
          const ruta = rutaDeFotoDeLaConsulta(url, uid, convId);
          const foto = ruta ? await leerFoto(ruta) : null;
          if (!foto || bytesDeFotos + foto.data.length > MAX_BYTES_IMAGENES_POR_PEDIDO) continue;
          bytesDeFotos += foto.data.length;
          partes.push({ inlineData: { mimeType: foto.mimeType, data: foto.data.toString('base64') } });
          incluidas++;
        }
      }
      if (incluidas < urls.length) {
        partes.push({ text: `(En este mensaje el paciente adjuntó ${urls.length} imagen(es); no se reenvían en este turno.)` });
      }
    } else if (texto) {
      partes.push({ text: texto });
    }

    if (partes.length) {
      contenidos.push({ role: datos.role === 'assistant' ? 'model' : 'user', parts: partes });
    }
  }

  return contenidos.reverse();
}

function instruccionDeSistema(paciente: PatientStructuredContext): string {
  const limpiar = (valor: unknown, maximo: number) => String(valor ?? '').replace(/\s+/g, ' ').trim().slice(0, maximo);
  const lista = (valores?: string[]) =>
    (Array.isArray(valores) ? valores : []).map((v) => limpiar(v, 100)).filter(Boolean).slice(0, 30).join(', ');

  const datos = [
    `Nombre: ${limpiar(paciente?.firstName, 80)} ${limpiar(paciente?.lastName, 80)}`.trim(),
    typeof paciente?.age === 'number' ? `Edad: ${paciente.age} años` : null,
    paciente?.sex ? `Sexo: ${limpiar(paciente.sex, 30)}` : null,
    lista(paciente?.allergies) ? `Alergias: ${lista(paciente?.allergies)}` : null,
    lista(paciente?.medications) ? `Medicamentos: ${lista(paciente?.medications)}` : null,
  ].filter(Boolean).join('\n');

  // El prompt de sistema y el contexto del paciente van juntos en systemInstruction,
  // que es donde Gemini espera lo que no es un turno de diálogo.
  return `${SYSTEM_PROMPT}

Contexto del paciente actual:
${datos}`;
}

async function preguntarALaIA(sistema: string, contenidos: GeminiContent[]): Promise<GeminiResult> {
  if (!process.env.GEMINI_API_KEY) {
    console.error('[Dra. Hilda] GEMINI_API_KEY no configurada');
  }
  return generateWithGemini({
    system: sistema,
    contents: contenidos,
    model: MODEL_ID,
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    thinkingBudget: THINKING_BUDGET,
    timeoutMs: 60_000,
    reintentos: 1,
  });
}

/** Mensaje para el paciente cuando la IA no respondió. */
function errorDeLaIA(resultado: Exclude<GeminiResult, { ok: true }>): string {
  const statusLabel = resultado.status ? ` ${resultado.status}` : '';
  // También los timeouts: sin este registro la alerta del chat no los veía.
  console.error(`[Dra. Hilda] Error de Gemini (${resultado.kind}${statusLabel}): ${resultado.detail}`);
  if (resultado.kind === 'timeout') {
    return conAvisoDeUrgencias('La solicitud tardó demasiado. Verifica tu conexión e intenta de nuevo.');
  }
  if (resultado.kind === 'blocked') {
    return conAvisoDeUrgencias('No puedo responder a ese contenido. Reformula tu consulta, por favor.');
  }
  return conAvisoDeUrgencias(`Error del servicio de IA${statusLabel}. Intenta de nuevo en unos segundos.`);
}

/** Tokens y límite de 20 mensajes por hora; null si puede seguir. */
async function puedeConsultar(uid: string): Promise<string | null> {
  const tokenState = await getUserTokenState(uid);
  if (!tokenState.available) {
    return 'No tienes tokens disponibles para iniciar una nueva consulta.';
  }
  const rateLimit = await checkRateLimit(uid);
  if (!rateLimit.allowed) {
    return conAvisoDeUrgencias(
      `Has superado el límite de 20 mensajes por hora. Por favor, espera ${rateLimit.remainingWait} minutos.`
    );
  }
  return null;
}

/**
 * Envía un mensaje del paciente a la Dra. Hilda.
 *
 * El servidor guarda la pregunta, arma el historial desde Firestore, llama a la IA
 * y guarda la respuesta. El teléfono solo manda el texto nuevo y las fotos que ya
 * subió a la carpeta de esta conversación.
 */
export async function enviarMensajeConsulta(
  idToken: string,
  convId: string,
  entrada: { texto: string; imageUrls?: string[] },
  paciente: PatientStructuredContext
): Promise<Resultado> {
  try {
    const sesion = await sesionConConversacion(idToken, convId);
    if ('error' in sesion) return fallo(sesion.error);
    const { uid } = sesion;

    const texto = typeof entrada?.texto === 'string' ? entrada.texto : '';
    const imageUrls = Array.isArray(entrada?.imageUrls) ? entrada.imageUrls.filter((u) => typeof u === 'string') : [];

    if (!texto.trim() && !imageUrls.length) return fallo('No se recibió ningún mensaje.');
    if (texto.length > MAX_CARACTERES_MENSAJE) return fallo(MENSAJE_MUY_LARGO);
    if (imageUrls.length > MAX_IMAGENES_POR_MENSAJE) return fallo(IMAGEN_NO_VALIDA);
    for (const url of imageUrls) {
      const ruta = rutaDeFotoDeLaConsulta(url, uid, convId);
      if (!ruta || !(await fotoValida(ruta))) return fallo(IMAGEN_NO_VALIDA);
    }

    // Como antes, la pregunta queda guardada aunque luego la frene el límite por hora.
    try {
      await persistConversationMessage(uid, convId, { role: 'user', content: texto, imageUrls });
    } catch (error) {
      console.error('[Dra. Hilda] Error guardando el mensaje del paciente:', error);
      return fallo(conAvisoDeUrgencias('Ocurrió un error inesperado. Intenta de nuevo.'));
    }

    const bloqueo = await puedeConsultar(uid);
    if (bloqueo) return fallo(bloqueo);

    const contenidos = await historialParaLaIA(uid, convId);
    const resultado = await preguntarALaIA(instruccionDeSistema(paciente), contenidos);
    if (!resultado.ok) return fallo(errorDeLaIA(resultado));

    try {
      await persistConversationMessage(uid, convId, { role: 'assistant', content: resultado.text });
    } catch (error) {
      // El paciente igual recibe la respuesta; queda registro para revisar.
      console.error('[Dra. Hilda] Error guardando la respuesta de la IA:', error);
    }

    return { success: true, message: resultado.text };
  } catch (error: any) {
    console.error('[Dra. Hilda] Error inesperado:', error);
    return fallo(conAvisoDeUrgencias('Ocurrió un error inesperado. Intenta de nuevo.'));
  }
}

/**
 * Saludo inicial de la Dra. Hilda en una conversación vacía. La instrucción se
 * arma en el servidor; el teléfono solo dice si es la primera vez y la franja del día.
 */
export async function saludarEnConsulta(
  idToken: string,
  convId: string,
  datos: { nombre?: string; primeraVez: boolean; periodo: string },
  paciente: PatientStructuredContext
): Promise<Resultado> {
  try {
    const sesion = await sesionConConversacion(idToken, convId);
    if ('error' in sesion) return fallo(sesion.error);
    const { uid } = sesion;

    const yaTieneMensajes = await conversacionRef(uid, convId).collection('mensajes').limit(1).get();
    if (!yaTieneMensajes.empty) return fallo('La conversación ya tiene mensajes.');

    const bloqueo = await puedeConsultar(uid);
    if (bloqueo) return fallo(bloqueo);

    const nombre = String(datos?.nombre ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const periodo = ['Buenos días', 'Buenas tardes', 'Buenas noches'].includes(datos?.periodo) ? datos.periodo : 'Hola';

    const instruccion = datos?.primeraVez
      ? nombre
        ? `Saluda al usuario llamado ${nombre} por primera vez. Preséntate y explícale qué es la teleorientación.`
        : 'Saluda al usuario por primera vez. Preséntate y explícale qué es la teleorientación.'
      : nombre
        ? `¡${periodo}, ${nombre}! Saluda brevemente y pregúntale en qué puedes orientarle hoy.`
        : `¡${periodo}! Saluda brevemente y pregúntale en qué puedes orientarle hoy.`;

    const resultado = await preguntarALaIA(instruccionDeSistema(paciente), [
      { role: 'user', parts: [{ text: instruccion }] },
    ]);
    if (!resultado.ok) return fallo(errorDeLaIA(resultado));

    await persistConversationMessage(uid, convId, { role: 'assistant', content: resultado.text });
    return { success: true, message: resultado.text };
  } catch (error: any) {
    console.error('[Dra. Hilda] Error en el saludo:', error);
    return fallo(conAvisoDeUrgencias('Ocurrió un error inesperado. Intenta de nuevo.'));
  }
}
