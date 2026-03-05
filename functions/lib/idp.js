"use strict";
/**
 * @fileoverview Cloud Function: Pipeline IDP (Intelligent Document Processing)
 *
 * Arquitectura "Cero Almacenamiento Visual":
 *   1. Cliente sube imagen a temp_ocr_uploads/{tutorId}/{patientId}/{file}
 *      con customMetadata.toBeProcessed = 'true'
 *   2. Esta CF detecta el archivo, descarga en memoria y llama a Gemini 1.5 Flash
 *   3. Guarda los datos estructurados en Firestore (idpExtracted)
 *   4. HARD DELETE del archivo — nunca se mueve, nunca persiste en Storage
 *
 * Rutas Firestore según ownerShip:
 *   Titular  (patientId === tutorId) → Cuentas_Tutor/{tutorId}/documents/{firestoreDocId}
 *   Familiar (patientId !== tutorId) → Cuentas_Tutor/{tutorId}/Integrantes/{patientId}/Documentos/{firestoreDocId}
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
exports.procesarDocumentoMedico = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const generative_ai_1 = require("@google/generative-ai");
try {
    admin.initializeApp();
}
catch (_) { /* ya inicializado por otro módulo */ }
const TEMP_PREFIX = "temp_ocr_uploads/";
/**
 * Prompt inyectado a Gemini 1.5 Flash.
 * Devuelve JSON puro sin bloques Markdown para facilitar el parseo.
 */
const IDP_PROMPT = 'Actúa como un extractor de datos médicos. Analiza este documento. ' +
    'Extrae la información y devuélvela ESTRICTAMENTE como un objeto JSON válido ' +
    'con la siguiente estructura: ' +
    '{ "estudio": "nombre del examen", ' +
    '"resultados": [{ "parametro": "ej. Hemoglobina", "valor": "14", ' +
    '"referencia": "12-16", "interpretacion": "Normal/Alta/Baja" }], ' +
    '"conclusion_general": "resumen si existe" }. ' +
    'No devuelvas formato Markdown (sin ```json), solo el JSON puro.';
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Elimina un archivo de Storage de forma segura (silencia errores).
 * Se llama siempre — tanto en éxito como en error — para garantizar
 * que temp_ocr_uploads quede limpio.
 */
async function hardDelete(bucketName, filePath) {
    try {
        await admin.storage().bucket(bucketName).file(filePath).delete();
        console.log(`[IDP] 🗑️  Hard delete completado: ${filePath}`);
    }
    catch (err) {
        // El archivo puede haberse borrado ya en un reintento; no es crítico.
        console.warn(`[IDP] Advertencia en hard delete de ${filePath}:`, err);
    }
}
// ─────────────────────────────────────────────────────────────────────────────
exports.procesarDocumentoMedico = functions
    .region("us-central1")
    .storage.object()
    .onFinalize(async (object) => {
    var _a, _b, _c, _d, _e;
    const filePath = (_a = object.name) !== null && _a !== void 0 ? _a : "";
    const bucketName = (_b = object.bucket) !== null && _b !== void 0 ? _b : "";
    const contentType = (_c = object.contentType) !== null && _c !== void 0 ? _c : "image/png";
    const metadata = ((_d = object.metadata) !== null && _d !== void 0 ? _d : {});
    // ── Filtro de entrada ──────────────────────────────────────────────────
    // Procesar solo archivos de la zona temporal con el gatillo activado
    if (!filePath.startsWith(TEMP_PREFIX) || metadata.toBeProcessed !== "true") {
        return;
    }
    const { tutorId, patientId, firestoreDocId } = metadata;
    if (!tutorId || !patientId || !firestoreDocId) {
        console.error(`[IDP] Metadatos incompletos (tutorId/patientId/firestoreDocId) en: ${filePath}`);
        // No se puede actualizar Firestore, pero sí se borra el archivo huérfano
        await hardDelete(bucketName, filePath);
        return;
    }
    const db = admin.firestore();
    // Construir referencia al documento Firestore según quién es el dueño
    const docRef = patientId === tutorId
        ? db.doc(`Cuentas_Tutor/${tutorId}/documents/${firestoreDocId}`)
        : db.doc(`Cuentas_Tutor/${tutorId}/Integrantes/${patientId}/Documentos/${firestoreDocId}`);
    try {
        // ── Paso 1: Marcar como 'processing' ──────────────────────────────
        await docRef.update({ idpStatus: "processing" });
        console.log(`[IDP] ⚙️  Procesando: ${firestoreDocId}`);
        // ── Paso 2: Descargar archivo en memoria (nunca a disco) ───────────
        const bucket = admin.storage().bucket(bucketName);
        const [buffer] = await bucket.file(filePath).download();
        // ── Paso 3: Llamar a Gemini 1.5 Flash ─────────────────────────────
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey)
            throw new Error("GEMINI_API_KEY no configurada en el entorno.");
        const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent([
            IDP_PROMPT,
            {
                inlineData: {
                    data: buffer.toString("base64"),
                    mimeType: contentType,
                },
            },
        ]);
        // ── Paso 4: Parsear respuesta JSON ────────────────────────────────
        const rawText = result.response.text().trim();
        // Limpiar posibles bloques ```json ... ``` por si el modelo los incluye
        const jsonText = rawText
            .replace(/^```json\s*/i, "")
            .replace(/^```\s*/i, "")
            .replace(/```$/i, "")
            .trim();
        const idpExtracted = JSON.parse(jsonText);
        // ── Paso 5: Guardar en Firestore + eliminar campos de Storage ─────
        // url y storagePath se borran con FieldValue.delete() porque el archivo
        // dejará de existir — arquitectura de Cero Almacenamiento Visual
        await docRef.update({
            idpStatus: "done",
            idpExtracted,
            url: admin.firestore.FieldValue.delete(),
            storagePath: admin.firestore.FieldValue.delete(),
        });
        console.log(`[IDP] ✅ Extracción completada para doc ${firestoreDocId}:`, idpExtracted);
    }
    catch (err) {
        // ── Manejo de errores: siempre registrado en Firestore ────────────
        console.error(`[IDP] ❌ Error al procesar ${filePath}:`, err);
        try {
            await docRef.update({
                idpStatus: "error",
                idpError: (_e = err === null || err === void 0 ? void 0 : err.message) !== null && _e !== void 0 ? _e : String(err),
            });
        }
        catch (updateErr) {
            console.error("[IDP] No se pudo actualizar idpStatus a 'error':", updateErr);
        }
    }
    finally {
        // ── HARD DELETE — siempre, en éxito o error ───────────────────────
        // La política de Cero Almacenamiento Visual exige que el archivo
        // temporal sea eliminado. Storage rules deniegan el delete al cliente;
        // solo el Admin SDK puede ejecutarlo.
        await hardDelete(bucketName, filePath);
    }
});
//# sourceMappingURL=idp.js.map