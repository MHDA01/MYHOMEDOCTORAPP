
"use strict";
/**
 * @fileoverview Cloud Function to process medical documents using Genkit AI.
 * This function triggers on creation of a document in Firestore,
 * performs OCR, extracts structured lab values, and updates the document.
 */
import * as logger from "firebase-functions/logger";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/googleai";
import { defineFlow, run, AIFlowError } from "@genkit-ai/flow";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Genkit with the Google AI plugin.
// This must be done once, at the top level.
genkit({
  plugins: [
    googleAI({
      // Specify the API version.
      apiVersion: "v1beta",
    }),
  ],
});

// Define the Zod schema for a single lab result.
const LabResultSchema = z.object({
  examen: z.string().describe("Nombre del examen de laboratorio."),
  valor: z.string().describe("El valor o resultado obtenido."),
  unidades: z.string().describe("Las unidades en que se mide el valor (ej. mg/dL, %, etc.)."),
  rangoDeReferencia: z.string().describe("El rango normal o de referencia para el examen."),
});

// Define the Zod schema for the entire list of lab results.
const ExtractedLabValuesSchema = z.object({
  results: z.array(LabResultSchema).describe("Una lista de los resultados de laboratorio encontrados en el documento."),
});

// Define the Genkit flow for processing a document.
const processDocumentFlow = defineFlow(
  {
    name: "processDocumentFlow",
    inputSchema: z.object({ documentDataUris: z.array(z.string()) }),
    outputSchema: ExtractedLabValuesSchema,
  },
  async ({ documentDataUris }) => {
    // Step 1: Perform OCR on the document images using Gemini.
    const ocrResponse = await run("extract-text", async () => {
      const llm = googleAI.model("gemini-1.5-flash");
      return await llm.generate({
        prompt: [
          {
            text: "Extrae el texto completo de las siguientes imágenes de un informe de laboratorio médico. Combina el texto de todas las páginas en un solo bloque de texto coherente.",
          },
          ...documentDataUris.map((uri) => ({ media: { url: uri } })),
        ],
      });
    });

    const transcription = ocrResponse.text();
    logger.info(`OCR completed. Transcription length: ${transcription.length}`);

    // Guard against empty or very short transcriptions.
    if (!transcription || transcription.trim().length < 20) {
      throw new AIFlowError("La transcripción del texto es demasiado corta para ser analizada.");
    }

    // Step 2: Extract structured lab values from the transcribed text.
    const extractionResponse = await run("extract-lab-values", async () => {
      const llm = googleAI.model("gemini-1.5-flash");
      return await llm.generate({
        prompt: `Actúa como un experto en análisis de datos de laboratorio médico. Lee el siguiente texto extraído de un informe y extrae TODOS los valores de laboratorio que encuentres. Formatea la salida como un objeto JSON estructurado que cumpla con el esquema proporcionado. Para cada resultado, incluye el nombre del examen, el valor, las unidades y el rango de referencia. Si un campo no está presente para un resultado, déjalo como un string vacío. IMPORTANTE: La salida final DEBE ser exclusivamente el objeto JSON.
        Aquí está el texto del documento:
        ${transcription}`,
        output: {
          schema: ExtractedLabValuesSchema,
        },
      });
    });

    const labResults = extractionResponse.output();
    if (!labResults) {
      throw new AIFlowError("La IA no pudo extraer los valores de laboratorio del texto.");
    }
    logger.info("Extracción de datos completada con éxito.");

    return labResults;
  }
);

// The main Cloud Function that triggers on document creation.
export const processdocument = onDocumentCreated(
  {
    document: "users/{userId}/documents/{docId}",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const { userId, docId } = event.params;
    const snap = event.data;

    if (!snap) {
      logger.log(`No data associated with the event for document ${docId}.`);
      return;
    }
    const data = snap.data();
    const docRef = snap.ref;

    // Guard: Only proceed if the status is 'pending' and URLs are present.
    if (data?.processingStatus !== 'pending' || !data.urls || data.urls.length === 0) {
      logger.log(`Document ${docId} is not pending or has no URLs. Skipping.`);
      return;
    }

    logger.info(`Processing document ${docId} for user ${userId}`);

    try {
      // 1. Set status to 'processing'
      await docRef.update({ processingStatus: 'processing' });
      logger.info(`Document ${docId} status updated to 'processing'.`);

      // 2. Run the Genkit flow
      const result = await processDocumentFlow({ documentDataUris: data.urls });
      
      // 3. Update the document with the extracted results
      await docRef.update({
        labResults: result.results, // Save the array of results directly
        processingStatus: 'completed',
        processingError: null,
      });

      logger.info(`Successfully updated document ${docId} with ${result.results.length} extracted lab values.`);
    } catch (error: any) {
      logger.error(`Error processing document ${docId}:`, error);
      const errorMessage = error instanceof AIFlowError ? error.message : "Un error inesperado ocurrió durante el procesamiento.";
      
      // 4. Update the document with the error status
      await docRef.update({
        processingStatus: 'error',
        processingError: errorMessage,
      });
    }
  }
);
