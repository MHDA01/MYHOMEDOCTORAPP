
"use strict";
/**
 * @fileoverview Cloud Function to process medical documents using Genkit AI.
 * This function triggers on creation of a new document in Firestore,
 * performs OCR, generates a summary, and updates the document.
 */
import * as logger from "firebase-functions/logger";
import {onDocumentCreated} from "firebase-functions/v2/firestore";

import {genkit, z} from "genkit";
import {googleAI} from "@genkit-ai/googleai";
import {defineFlow, AIFlowError, run} from "@genkit-ai/flow";
import {getFirestore} from "firebase-admin/firestore";

// Initialize Genkit with the Google AI plugin
genkit({
  plugins: [googleAI()],
});

// Define the output schema for the AI summary, matching the frontend types
const ProcessedDocumentOutputSchema = z.object({
  diagnosticoPrincipal: z
    .string()
    .describe("A primary diagnosis based on the findings."),
  hallazgosClave: z
    .array(z.string())
    .describe(
      "A list of the most important findings, such as out-of-range results."
    ),
  recomendaciones: z
    .array(z.string())
    .describe("A list of recommendations or next steps to follow."),
});

// Define the Genkit Flow for processing a document
const processDocumentFlow = defineFlow(
  {
    name: "processDocumentFlow",
    inputSchema: z.array(z.string()),
    outputSchema: z.object({
      transcription: z.string(),
      summary: ProcessedDocumentOutputSchema,
    }),
  },
  async (documentDataUris) => {
    // Step 1: Perform OCR on the document images
    const ocrResponse = await run("extract-text", async () => {
      const llm = googleAI.model("gemini-1.5-flash");
      return await llm.generate({
        prompt: [
          {
            text: "Extrae el texto completo de las siguientes imágenes de documentos médicos. Combina el texto de todas las páginas en un solo bloque de texto coherente.",
          },
          ...documentDataUris.map((uri) => ({media: {url: uri}})),
        ],
      });
    });

    const transcription = ocrResponse.text();
    logger.info(`OCR completed. Transcription length: ${transcription.length}`);

    // If transcription is too short or empty, abort with a clear message
    if (!transcription || transcription.trim().length < 20) {
      throw new AIFlowError(
        "Transcription is too short, cannot generate summary."
      );
    }

    // Step 2: Generate the summary from the extracted text
    const summaryResponse = await run("summarize-text", async () => {
      const llm = googleAI.model("gemini-1.5-flash");
      return await llm.generate({
        prompt: `Actúa como un asistente médico profesional. Lee el siguiente texto extraído de un estudio clínico y genera un resumen estructurado en español que sea fácil de entender para el paciente. Extrae la información clave y organízala en las siguientes secciones: "Diagnóstico Principal", "Hallazgos Clave" y "Recomendaciones". Sé conciso, preserva la terminología clínica esencial y evita sacar conclusiones más allá de los datos proporcionados.
IMPORTANTE: El resumen final DEBE ser exclusivamente en español.

Aquí está el texto del documento:
${transcription}
`,
        output: {
          schema: ProcessedDocumentOutputSchema,
        },
      });
    });

    const summary = summaryResponse.output();
    if (!summary) {
      throw new AIFlowError("AI failed to generate a summary.");
    }
    logger.info("Summarization completed successfully.");

    return {
      transcription,
      summary,
    };
  }
);

// Define the Cloud Function that triggers on new document creation
export const oncreatedocument = onDocumentCreated(
  "users/{userId}/documents/{docId}",
  async (event) => {
    const {userId, docId} = event.params;
    const snap = event.data;

    if (!snap) {
      logger.log("No data associated with the event");
      return;
    }

    const data = snap.data();

    // Check for consent and if the summary already exists
    if (!data.consent || data.aiSummary) {
      logger.log(
        `Skipping document ${docId}: consent not given or summary already exists.`
      );
      return;
    }

    logger.info(`Processing document ${docId} for user ${userId}`);

    try {
      // Run the Genkit flow with the document image URLs
      const result = await processDocumentFlow(data.urls);

      // Update the Firestore document with the transcription and summary
      await getFirestore().collection("users").doc(userId).collection("documents").doc(docId).update({
        transcription: result.transcription,
        aiSummary: result.summary,
      });

      logger.info(`Successfully updated document ${docId} with AI summary.`);
    } catch (error) {
      logger.error(`Error processing document ${docId}:`, error);
      // Optionally, update the document with an error state
      await getFirestore().collection("users").doc(userId).collection("documents").doc(docId).update({
        aiSummary: {
          diagnosticoPrincipal: "Error en el procesamiento",
          hallazgosClave: ["La IA no pudo analizar este documento."],
          recomendaciones: [
            "Por favor, inténtalo de nuevo con una imagen de mejor calidad o contacta a soporte si el problema persiste.",
          ],
        },
      });
    }
  }
);
