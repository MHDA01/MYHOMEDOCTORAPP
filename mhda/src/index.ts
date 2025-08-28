
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

import vision from "@google-cloud/vision";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

admin.initializeApp();

const db = admin.firestore();

const client = new vision.ImageAnnotatorClient();


export const processMedicalDocument = functions.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name!;
    if (!filePath.startsWith("medical-documents/")) return;

    const pathParts = filePath.split("/");
    const userId = pathParts[1];
    const documentId = pathParts[2];
    const fileName = pathParts[pathParts.length - 1];

    // Descargar archivo temporalmente
    const tempFilePath = path.join(os.tmpdir(), fileName);
    await admin.storage().bucket(object.bucket).file(filePath).download({ destination: tempFilePath });

    // OCR con Vision AI
    const [result] = await client.documentTextDetection(tempFilePath);
    const ocrRawText = result.fullTextAnnotation?.text || "";

    // Clasificación y extracción básica
    let documentType: "lab_result" | "imaging_study" | "other" = "other";
    let summary = "";
    let details: any[] = [];
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
    } else if (/impresi[oó]n diagn[oó]stica|conclusi[oó]n|imagenolog/i.test(ocrRawText)) {
      documentType = "imaging_study";
      summary = "Estudio de imagen detectado.";
      const conclMatch = ocrRawText.match(/(Conclusi[oó]n|Impresi[oó]n Diagn[oó]stica)[\s\S]{0,200}/i);
      conclusions = conclMatch ? conclMatch[0] : "";
    } else {
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
