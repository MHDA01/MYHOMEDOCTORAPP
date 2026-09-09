"use strict";
/**
 * @fileoverview Cloud Function programada: consejo de salud diario personalizado.
 * Genera un consejo de bienestar por usuario (perfil + historial + conversación
 * reciente) vía la API de Gemini, lo guarda en Firestore para mostrarlo dentro de la app,
 * y envía una notificación push GENÉRICA (el contenido real nunca va en el cuerpo
 * del push, para no exponer datos de salud en la pantalla de bloqueo).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailyHealthTips = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const crypto_1 = require("./lib/crypto");
const gemini_client_1 = require("./lib/gemini-client");
try {
    admin.initializeApp();
}
catch (e) {
    // Ya inicializado en otro módulo
}
const db = admin.firestore();
const messaging = admin.messaging();
const MODEL_ID = process.env.DAILY_TIPS_MODEL || "gemini-3.5-flash";
const MAX_TOKENS = 250;
const TEMPERATURE = 0.7;
const NEW_USER_WINDOW_DAYS = 7;
function buildSystemPrompt(isNewUser) {
    const base = `Eres Dra. Hilda, la asistente de orientación en salud de myhomedoctorapp.
Vas a escribir UN consejo de bienestar breve (máximo 60 palabras) y personalizado para el usuario, en español, tono cálido y cercano.

Reglas clínicas (igual que en el chat de orientación):
- NO diagnostiques ni prescribas medicamentos o dosis.
- NO des indicaciones que reemplacen una consulta médica presencial.
- Si el contexto sugiere algo urgente, en vez de un consejo recuérdale acudir a su médico o a urgencias (línea 123).
- Usa lenguaje probabilístico, nunca certeza absoluta.

Devuelve SOLO el texto del consejo, sin encabezados ni explicaciones.`;
    const toneNote = isNewUser
        ? "\nEste es un usuario NUEVO (menos de 7 días registrado): dale un consejo de bienvenida/educativo sobre cómo cuidar su salud y cómo usar la orientación de la app."
        : "\nEste es un usuario ya establecido: dale un consejo de refuerzo de hábito, breve y accionable.";
    return base + toneNote;
}
function safeDecryptJsonArray(value) {
    if (typeof value !== "string" || !value)
        return [];
    try {
        const parsed = JSON.parse((0, crypto_1.decryptField)(value));
        return Array.isArray(parsed) ? parsed : [];
    }
    catch (_a) {
        return [];
    }
}
function extractHealthInfo(rawHealthInfo) {
    if (!rawHealthInfo)
        return { allergies: [], medications: [], pathologicalHistory: "" };
    if (rawHealthInfo.isEncrypted) {
        return {
            allergies: safeDecryptJsonArray(rawHealthInfo.encryptedAllergies),
            medications: safeDecryptJsonArray(rawHealthInfo.encryptedMedications),
            pathologicalHistory: rawHealthInfo.encrypted_pathologicalHistory
                ? (0, crypto_1.decryptField)(rawHealthInfo.encrypted_pathologicalHistory)
                : "",
        };
    }
    return {
        allergies: Array.isArray(rawHealthInfo.allergies) ? rawHealthInfo.allergies : [],
        medications: Array.isArray(rawHealthInfo.medications) ? rawHealthInfo.medications : [],
        pathologicalHistory: rawHealthInfo.pathologicalHistory || "",
    };
}
async function getRecentConversationSummary(uid) {
    const convSnap = await db
        .collection("Cuentas_Tutor")
        .doc(uid)
        .collection("conversaciones")
        .orderBy("updatedAt", "desc")
        .limit(1)
        .get();
    if (convSnap.empty)
        return "Sin conversaciones previas.";
    const msgsSnap = await convSnap.docs[0].ref
        .collection("mensajes")
        .orderBy("timestamp", "desc")
        .limit(6)
        .get();
    const lines = msgsSnap.docs
        .reverse()
        .map((d) => {
        const data = d.data();
        const content = data.isEncrypted ? (0, crypto_1.decryptField)(data.content) : data.content;
        return `${data.role === "assistant" ? "Dra. Hilda" : "Usuario"}: ${content}`;
    });
    return lines.length ? lines.join("\n") : "Sin conversaciones previas.";
}
async function generateTipForUser(uid) {
    const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
    if (!userDoc.exists)
        return null;
    const data = userDoc.data();
    const personalInfo = data.personalInfo || {};
    const healthInfo = extractHealthInfo(data.healthInfo);
    const recentConversation = await getRecentConversationSummary(uid);
    let isNewUser = false;
    try {
        const authUser = await admin.auth().getUser(uid);
        const createdAt = new Date(authUser.metadata.creationTime);
        const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        isNewUser = ageDays <= NEW_USER_WINDOW_DAYS;
    }
    catch (err) {
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
        const content = await (0, gemini_client_1.callGeminiText)(buildSystemPrompt(isNewUser), userContext, {
            model: MODEL_ID,
            maxTokens: MAX_TOKENS,
            temperature: TEMPERATURE,
        });
        return content || null;
    }
    catch (error) {
        console.error(`[DailyTips] Error generando consejo para ${uid}:`, error);
        return null;
    }
}
function todayDocId() {
    const now = new Date();
    const bogota = new Date(now.toLocaleString("en-US", { timeZone: "America/Bogota" }));
    const yyyy = bogota.getFullYear();
    const mm = String(bogota.getMonth() + 1).padStart(2, "0");
    const dd = String(bogota.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}
exports.sendDailyHealthTips = functions
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
    for (const userDoc of usersSnapshot.docs) {
        const uid = userDoc.id;
        try {
            const existing = await userDoc.ref.collection("dailyTips").doc(dateId).get();
            if (existing.exists)
                continue; // ya generado hoy (re-ejecución segura)
            const content = await generateTipForUser(uid);
            if (!content)
                continue;
            const authUser = await admin.auth().getUser(uid).catch(() => null);
            const createdAt = authUser ? new Date(authUser.metadata.creationTime) : new Date();
            const isNewUser = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24) <= NEW_USER_WINDOW_DAYS;
            const token = userDoc.data().notificationToken;
            let pushSent = false;
            if (token) {
                try {
                    await messaging.send({
                        notification: {
                            title: "Tu consejo de salud de hoy 💙",
                            body: "Abre la app para verlo.",
                        },
                        data: { type: "daily_health_tip", date: dateId },
                        token,
                    });
                    pushSent = true;
                }
                catch (err) {
                    console.error(`[DailyTips] Error enviando push a ${uid}:`, err);
                }
            }
            await userDoc.ref.collection("dailyTips").doc(dateId).set({
                content,
                isNewUser,
                date: dateId,
                generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                pushSent,
            });
        }
        catch (error) {
            console.error(`[DailyTips] Error procesando usuario ${uid}:`, error);
        }
    }
    console.log("[DailyTips] Generación de consejos diarios completada.");
    return null;
});
//# sourceMappingURL=daily-health-tips.js.map