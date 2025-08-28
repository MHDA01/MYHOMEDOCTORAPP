"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processMedicalDocument = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const vision_1 = __importDefault(require("@google-cloud/vision"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
admin.initializeApp();
const db = admin.firestore();
const client = new vision_1.default.ImageAnnotatorClient();
exports.processMedicalDocument = functions.storage
    .object()
    .onFinalize(async (object) => {
    var _a;
    const filePath = object.name;
    if (!filePath.startsWith("medical-documents/"))
        return;
    const pathParts = filePath.split("/");
    const userId = pathParts[1];
    const documentId = pathParts[2];
    const fileName = pathParts[pathParts.length - 1];
    // Descargar archivo temporalmente
    const tempFilePath = path.join(os.tmpdir(), fileName);
    await admin.storage().bucket(object.bucket).file(filePath).download({ destination: tempFilePath });
    // OCR con Vision AI
    const [result] = await client.documentTextDetection(tempFilePath);
    const ocrRawText = ((_a = result.fullTextAnnotation) === null || _a === void 0 ? void 0 : _a.text) || "";
    // Clasificación y extracción básica
    let documentType = "other";
    let summary = "";
    let details = [];
    let conclusions = "";
    if (/glucosa|colesterol|hemoglobina|leucocitos|eritrocitos|laboratorio/i.test(ocrRawText)) {
        documentType = "lab_result";
        summary = "Resultados de laboratorio detectados.";
        const regex = /([A-Za-zÁÉÍÓÚÜÑ ]+)\s+(\d+[\.,]?\d*)\s*([a-zA-Z%\/]*)\s*([<>=-]?\s*\d+[\.,]?\d*\s*[a-zA-Z%\/]*)?/g;
        let match;
        while ((match = regex.exec(ocrRawText)) !== null) {
            details.push({
                test: match[1].trim(),
                value: match[2],
                reference: match[4] || "",
            });
        }
    }
    else if (/impresi[oó]n diagn[oó]stica|conclusi[oó]n|imagenolog/i.test(ocrRawText)) {
        documentType = "imaging_study";
        summary = "Estudio de imagen detectado.";
        const conclMatch = ocrRawText.match(/(Conclusi[oó]n|Impresi[oó]n Diagn[oó]stica)[\s\S]{0,200}/i);
        conclusions = conclMatch ? conclMatch[0] : "";
    }
    else {
        summary = "Documento subido sin clasificación automática.";
    }
    // Guardar en Firestore
    const docRef = db.collection("medicalDocuments").doc(userId).collection("items").doc(documentId);
    await docRef.set({
        documentId,
        userId,
        fileName,
        storagePath: filePath,
        uploadDate: admin.firestore.FieldValue.serverTimestamp(),
        studyDate: null,
        documentType,
        ocrRawText,
        extractedData: {
            summary,
            details,
            conclusions,
        },
        doctorObservations: "",
    });
    fs.unlinkSync(tempFilePath);
});
//# sourceMappingURL=index.js.map