/**
 * @fileoverview Cloud Function to process uploaded medical documents.
 *
 * This function triggers when a file is uploaded to Firebase Storage.
 * It performs the following steps:
 * 1. Extracts text from the document image using the Google Cloud Vision API.
 * 2. Summarizes the extracted text into a structured JSON format using the Vertex AI Gemini API.
 * 3. Saves the extracted text and the structured summary to the corresponding Firestore document.
 */
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { getStorage }sfrom "firebase-admin/storage";
import { getFirestore } from "firebase-admin/firestore";
import * as logger from "firebase-functions/logger";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import { VertexAI } from "@google-cloud/vertexai";

const visionClient = new ImageAnnotatorClient();
const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });

const generativeModel = vertexAI.getGenerativeModel({
  model: "gemini-1.5-flash-001",
});

const PROMPT = `
  You are an expert medical assistant specializing in analyzing and summarizing medical documents.
  Analyze the following text extracted from a medical document.
  Based on the text, provide a structured JSON summary.

  The JSON object must have the following fields:
  - "documentType": Classify the document. Valid values are "exam", "prescription", "report", or "other".
  - "date": The date of the document in "YYYY-MM-DD" format. If not found, use the current date.
  - "attendingPhysician": The name of the doctor or medical professional. If not found, use "N/A".
  - "relevantFindings": A brief summary of the key findings or results. If not applicable, use "N/A".
  - "diagnosis": The diagnosis mentioned in the document. If not found, use "N/A".
  - "medications": A list of all medications mentioned, including dosage if available. If none, use an empty array [].
  - "patientRecommendations": Any recommendations given to the patient. If none, use "N/A".

  Do not include any extra text or explanations outside of the JSON object.
  Do not wrap the JSON in markdown backticks.

  Extracted Text:
  """
  {{text}}
  """
`;

export const processDocument = onObjectFinalized({
    bucket: process.env.GCLOUD_STORAGE_BUCKET || undefined,
    cpu: 2,
    memory: "1GiB",
    timeoutSeconds: 300,
  }, async (event) => {
  const { bucket, name: filePath, contentType } = event.data;

  if (!filePath || !filePath.startsWith("users/")) {
    logger.log(`File path ${filePath} is not a user document. Skipping.`);
    return;
  }
  
  if (!contentType?.startsWith("image/")) {
    logger.warn(`File ${filePath} is not an image (${contentType}). Skipping.`);
    return;
  }
  
  const pathParts = filePath.split("/");
  const userId = pathParts[1];
  const fileName = pathParts[3];
  const docId = fileName.split('-')[0];

  if (!userId || !docId) {
    logger.error("Could not extract userId or docId from file path.", { filePath });
    return;
  }
  
  const docRef = getFirestore().collection("users").doc(userId).collection("documents").doc(docId);
  logger.info(`Processing document for user: ${userId}, doc: ${docId}`);

  try {
    // 1. Extract text with Cloud Vision API
    const gcsUri = `gs://${bucket}/${filePath}`;
    const [result] = await visionClient.documentTextDetection(gcsUri);
    const fullTextAnnotation = result.fullTextAnnotation;
    const extractedText = fullTextAnnotation?.text || "";

    if (!extractedText.trim()) {
      logger.warn("No text extracted from the document.", { docId });
      await docRef.update({
        processingStatus: "error",
        processingError: "No text could be extracted from the image.",
        processedAt: new Date().toISOString(),
      });
      return;
    }
    
    await docRef.update({
        transcription: extractedText,
        processingStatus: "summarizing",
    });

    // 2. Summarize text with Vertex AI Gemini
    const promptWithText = PROMPT.replace("{{text}}", extractedText);
    const resp = await generativeModel.generateContent(promptWithText);
    const summaryText = resp.response.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!summaryText) {
        throw new Error("Gemini response was empty or invalid.");
    }
    
    // 3. Parse and save summary to Firestore
    const summaryJson = JSON.parse(summaryText);

    await docRef.update({
      summary: summaryJson,
      processingStatus: "completed",
      processedAt: new Date().toISOString(),
    });
    
    logger.info(`Successfully processed document ${docId}.`);

  } catch (error) {
    logger.error("Error processing document:", { docId, error });
    await docRef.update({
      processingStatus: "error",
      processingError: "An unexpected error occurred during analysis.",
      processedAt: new Date().toISOString(),
    });
  }
});
