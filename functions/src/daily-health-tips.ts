/**
 * @fileoverview Cloud Function programada: consejo de salud diario personalizado.
 * Genera un consejo de bienestar por usuario (perfil + historial + conversación
 * reciente) vía la API de Gemini, lo guarda en Firestore para mostrarlo dentro de la app,
 * y envía una notificación push GENÉRICA (el contenido real nunca va en el cuerpo
 * del push, para no exponer datos de salud en la pantalla de bloqueo).
 */

import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { decryptField } from "./lib/crypto";
import { callGeminiText } from "./lib/gemini-client";

try {
  admin.initializeApp();
} catch (e) {
  // Ya inicializado en otro módulo
}

const db = admin.firestore();
const messaging = admin.messaging();

// El consejo diario son 60 palabras de bienestar, no triage clínico, así que
// corre en el modelo económico: flash-lite cuesta 5 veces menos por token de
// entrada ($0,30 vs $1,50 por millón) y 3,6 veces menos de salida. La calidad
// medida con este prompt es equivalente. El triage sí usa el modelo grande.
// Nota: flash-lite rechaza thinkingConfig; el cliente reintenta sin él solo.
const MODEL_ID = process.env.DAILY_TIPS_MODEL || "gemini-3.5-flash-lite";
const MAX_TOKENS = 250;
const MAX_USER_MESSAGES = 6;
// 0,4 y no 0,7: con contenido de salud importa más que no se aparte de las
// reglas clínicas que la variedad del texto. Es el mismo valor del chat.
const TEMPERATURE = 0.4;
const NEW_USER_WINDOW_DAYS = 7;

// Un tema por día, de una lista cerrada de hábitos de promoción y prevención
// que recomiendan la OMS/OPS y el Ministerio de Salud. Con temperatura baja y
// sin tema, el modelo daba casi el mismo consejo todos los días; así hay
// variedad sin dejarlo inventar de qué hablar.
const TEMAS_DEL_DIA = [
  "moverse más durante el día y pasar menos tiempo sentado",
  "dormir bien con horarios regulares de sueño",
  "comer más frutas y verduras",
  "reducir el azúcar y la sal en las comidas",
  "preferir agua en vez de bebidas azucaradas",
  "cuidar la salud mental: manejar el estrés y buscar apoyo cuando se necesita",
  "no fumar y evitar el humo de otros",
  "reducir o evitar el consumo de alcohol",
  "tener las vacunas al día (puede preguntar en su EPS o IPS)",
  "asistir a los controles preventivos que corresponden a su edad",
  "lavarse las manos con frecuencia",
  "consultar a tiempo: contarle a la Dra. Hilda en el chat cualquier síntoma nuevo",
];

function temaDeHoy(): string {
  const bogota = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const inicioDelAno = new Date(bogota.getFullYear(), 0, 0);
  const dia = Math.floor((bogota.getTime() - inicioDelAno.getTime()) / 86_400_000);
  return TEMAS_DEL_DIA[dia % TEMAS_DEL_DIA.length];
}

function buildSystemPrompt(isNewUser: boolean, tema: string): string {
  const base = `Eres Dra. Hilda, la asistente de orientación en salud de myhomedoctorapp.
Vas a escribir UN consejo de bienestar breve (máximo 60 palabras) y personalizado para el usuario, en español, tono cálido y cercano.

Qué puede ser el consejo: un hábito general de promoción de la salud o de prevención, sobre el tema del día que se indica al final. Personalízalo con su nombre y su contexto, pero el consejo debe seguir siendo un hábito general.

Reglas clínicas (obligatorias, sin excepciones):
- NUNCA menciones medicamentos: no sugieras iniciar, suspender, cambiar, sustituir ni ajustar ningún medicamento, suplemento o producto natural.
- NO recomiendes remedios caseros, plantas, tés, productos naturales ni terapias alternativas.
- NO des tratamiento para síntomas o enfermedades concretas (dolor, fiebre, tos, presión alta...): eso se orienta en el chat. Si la conversación reciente menciona un síntoma, invítalo a contarle a la Dra. Hilda en el chat cómo sigue, sin sugerir qué hacer para el síntoma y sin decir que el hábito del consejo le ayudará con ese síntoma.
- NO diagnostiques ni atribuyas causas a sus síntomas.
- Respeta sus alergias y antecedentes: nunca propongas nada que los contradiga.
- No cites estudios, organismos, cifras ni niveles de evidencia.
- Si el contexto sugiere algo urgente, en vez de un consejo recuérdale acudir a urgencias o llamar a la línea 123.
- Usa lenguaje probabilístico, nunca certeza absoluta.
- No uses saludos que dependan de la hora ("buenos días", "buenas noches"): el consejo puede leerse a cualquier hora.

Devuelve SOLO el texto del consejo, sin encabezados ni explicaciones.`;

  const toneNote = isNewUser
    ? "\nEste es un usuario NUEVO (menos de 7 días registrado): dale un consejo de bienvenida/educativo sobre cómo cuidar su salud y cómo usar la orientación de la app."
    : "\nEste es un usuario ya establecido: dale un consejo de refuerzo de hábito, breve y accionable.";

  return `${base}${toneNote}\nTema del consejo de hoy: ${tema}.`;
}

interface DecryptedHealthInfo {
  allergies: string[];
  medications: string[];
  pathologicalHistory: string;
}

function safeDecryptJsonArray(value: unknown): string[] {
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(decryptField(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function extractHealthInfo(rawHealthInfo: any): DecryptedHealthInfo {
  if (!rawHealthInfo) return { allergies: [], medications: [], pathologicalHistory: "" };

  if (rawHealthInfo.isEncrypted) {
    return {
      allergies: safeDecryptJsonArray(rawHealthInfo.encryptedAllergies),
      medications: safeDecryptJsonArray(rawHealthInfo.encryptedMedications),
      pathologicalHistory: rawHealthInfo.encrypted_pathologicalHistory
        ? decryptField(rawHealthInfo.encrypted_pathologicalHistory)
        : "",
    };
  }

  return {
    allergies: Array.isArray(rawHealthInfo.allergies) ? rawHealthInfo.allergies : [],
    medications: Array.isArray(rawHealthInfo.medications) ? rawHealthInfo.medications : [],
    pathologicalHistory: rawHealthInfo.pathologicalHistory || "",
  };
}

async function getRecentConversationSummary(uid: string): Promise<string> {
  const convSnap = await db
    .collection("Cuentas_Tutor")
    .doc(uid)
    .collection("conversaciones")
    .orderBy("updatedAt", "desc")
    .limit(1)
    .get();

  if (convSnap.empty) return "Sin conversaciones previas.";

  // Solo se envían los mensajes del propio usuario, no las respuestas de la
  // Dra. Hilda. Medido: con los 6 mensajes completos el prompt pesaba 1.369
  // tokens, de los cuales 1.307 (el 95 %) eran las respuestas de ella — texto
  // que el modelo ya generó y que se estaba pagando otra vez como entrada. La
  // señal clínica está en lo que escribe el paciente, y eso cuesta ~90 tokens.
  //
  // Se leen 12 documentos para quedarse con los últimos 6 turnos del usuario,
  // que es más contexto clínico que antes por una fracción del costo.
  const msgsSnap = await convSnap.docs[0].ref
    .collection("mensajes")
    .orderBy("timestamp", "desc")
    .limit(12)
    .get();

  const lines = msgsSnap.docs
    .filter((d) => d.data().role !== "assistant")
    .slice(0, MAX_USER_MESSAGES)
    .reverse()
    .map((d) => {
      const data = d.data();
      const content = data.isEncrypted ? decryptField(data.content) : data.content;
      return `Usuario: ${content}`;
    });

  return lines.length ? lines.join("\n") : "Sin conversaciones previas.";
}

async function generateTipForUser(uid: string): Promise<string | null> {
  const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
  if (!userDoc.exists) return null;

  const data = userDoc.data() as any;
  const personalInfo = data.personalInfo || {};
  const healthInfo = extractHealthInfo(data.healthInfo);
  const recentConversation = await getRecentConversationSummary(uid);

  let isNewUser = false;
  try {
    const authUser = await admin.auth().getUser(uid);
    const createdAt = new Date(authUser.metadata.creationTime);
    const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    isNewUser = ageDays <= NEW_USER_WINDOW_DAYS;
  } catch (err) {
    console.warn(`[DailyTips] No se pudo leer metadata de Auth para ${uid}:`, err);
  }

  const userContext = [
    `Nombre: ${personalInfo.firstName || "Usuario"}`,
    personalInfo.sex ? `Sexo: ${personalInfo.sex}` : null,
    healthInfo.allergies.length ? `Alergias: ${healthInfo.allergies.join(", ")}` : null,
    healthInfo.medications.length ? `Medicamentos actuales: ${healthInfo.medications.join(", ")}` : null,
    healthInfo.pathologicalHistory ? `Antecedentes: ${healthInfo.pathologicalHistory}` : null,
    `Conversación reciente:\n${recentConversation}`,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const content = await callGeminiText(buildSystemPrompt(isNewUser, temaDeHoy()), userContext, {
      model: MODEL_ID,
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    });
    return content || null;
  } catch (error) {
    console.error(`[DailyTips] Error generando consejo para ${uid}:`, error);
    return null;
  }
}

/**
 * Genera el consejo del día, lo guarda en Firestore y, si se le pasa un token,
 * manda el push. Compartido por el cron de las 7am y por la generación bajo
 * demanda, para que el prompt y el formato del documento no se dupliquen.
 */
async function createAndStoreTip(
  userRef: admin.firestore.DocumentReference,
  uid: string,
  dateId: string,
  pushToken?: string
): Promise<string | null> {
  const content = await generateTipForUser(uid);
  if (!content) return null;

  const authUser = await admin.auth().getUser(uid).catch(() => null);
  const createdAt = authUser ? new Date(authUser.metadata.creationTime) : new Date();
  const isNewUser = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24) <= NEW_USER_WINDOW_DAYS;

  let pushSent = false;
  if (pushToken) {
    try {
      await messaging.send({
        notification: {
          title: "Tu consejo de salud de hoy 💙",
          body: "Abre la app para verlo.",
        },
        data: { type: "daily_health_tip", date: dateId },
        token: pushToken,
      });
      pushSent = true;
    } catch (err) {
      console.error(`[DailyTips] Error enviando push a ${uid}:`, err);
    }
  }

  await userRef.collection("dailyTips").doc(dateId).set({
    content,
    isNewUser,
    date: dateId,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    pushSent,
  });

  return content;
}

function todayDocId(): string {
  const now = new Date();
  const bogota = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
  const yyyy = bogota.getFullYear();
  const mm = String(bogota.getMonth() + 1).padStart(2, "0");
  const dd = String(bogota.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Consejos que se generan a la vez en la tarea de la mañana. */
const CONSEJOS_EN_PARALELO = 10;
/** Pasado este tiempo no se empiezan consejos nuevos (la tarea tiene 540 s). */
const TIEMPO_LIMITE_CONSEJOS_MS = 480_000;

export const sendDailyHealthTips = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("0 7 * * *")
  .timeZone("America/Bogota")
  .onRun(async (_context) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[DailyTips] GEMINI_API_KEY no configurada. Abortando.");
      return null;
    }

    console.log("[DailyTips] Iniciando generación de consejos diarios.");
    const dateId = todayDocId();

    const usersSnapshot = await db.collection("Cuentas_Tutor").get();
    console.log(`[DailyTips] ${usersSnapshot.size} usuarios encontrados.`);

    // Solo se pregenera para quien puede recibir la notificación. Para el resto,
    // pregenerar es gasto puro: el consejo se queda en Firestore esperando a que
    // la persona entre por su cuenta, y si entra, generateDailyTipNow se lo crea
    // en ese momento (más fresco y sin costo si nunca entra).
    const conToken = usersSnapshot.docs.filter((d) => {
      const t = d.data().notificationToken;
      return typeof t === "string" && t.length > 0;
    });
    console.log(`[DailyTips] ${conToken.length} con token de notificación; el resto se genera bajo demanda.`);

    // De a uno, cada consejo tarda varios segundos y la tarea se cortaba a los 9
    // minutos con unos cientos de cuentas. Ahora trabajan varios a la vez y se deja
    // de empezar consejos nuevos antes del límite, para no cortar uno a medias.
    const inicio = Date.now();
    let siguiente = 0;

    const trabajador = async () => {
      while (siguiente < conToken.length && Date.now() - inicio < TIEMPO_LIMITE_CONSEJOS_MS) {
        const userDoc = conToken[siguiente++];
        const uid = userDoc.id;

        try {
          const existing = await userDoc.ref.collection("dailyTips").doc(dateId).get();
          if (existing.exists) continue; // ya generado hoy (re-ejecución segura)

          await createAndStoreTip(
            userDoc.ref,
            uid,
            dateId,
            userDoc.data().notificationToken as string | undefined
          );
        } catch (error) {
          console.error(`[DailyTips] Error procesando usuario ${uid}:`, error);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(CONSEJOS_EN_PARALELO, conToken.length) }, () => trabajador())
    );

    const pendientes = conToken.length - siguiente;
    if (pendientes > 0) {
      console.warn(`[DailyTips] Tiempo agotado: ${pendientes} cuentas quedan para la generación bajo demanda.`);
    }
    console.log("[DailyTips] Generación de consejos diarios completada.");
    return null;
  });

/**
 * Generación bajo demanda: la llama la tarjeta del dashboard cuando el usuario
 * abre la app y todavía no existe el consejo de hoy.
 *
 * Es la contraparte del filtro por token en el cron. Con esto el costo de IA
 * sigue al uso real en vez de generarle un consejo cada mañana a gente que no
 * entra hace meses. No manda push: quien la invoca ya está dentro de la app.
 */
export const generateDailyTipNow = functions
  .region("us-central1")
  .runWith({ timeoutSeconds: 60, memory: "512MB" })
  .https.onCall(async (_data, context) => {
    const uid = context.auth?.uid;
    if (!uid) {
      throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
    }

    const dateId = todayDocId();
    const userRef = db.collection("Cuentas_Tutor").doc(uid);

    // Si el cron ya lo generó (usuario con push), se devuelve ese mismo.
    const existing = await userRef.collection("dailyTips").doc(dateId).get();
    if (existing.exists) {
      return { content: (existing.data()?.content as string) ?? null };
    }

    const userSnap = await userRef.get();
    if (!userSnap.exists) return { content: null };

    try {
      return { content: await createAndStoreTip(userRef, uid, dateId) };
    } catch (error) {
      console.error(`[DailyTips] Error generando bajo demanda para ${uid}:`, error);
      return { content: null };
    }
  });
