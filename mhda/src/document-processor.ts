
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
import { defineFlow, AIFlowError, run } from "@genkit-ai/flow";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Genkit with the Google AI plugin
genkit({
  plugins: [googleAI()],
});

// Define the output schema for the extracted lab values
const ExtractedLabValuesSchema = z.object({
  results: z.array(z.object({
      examen: z.string().describe("Nombre del examen de laboratorio."),
      valor: z.string().describe("El valor o resultado obtenido."),
      unidades: z.string().describe("Las unidades en que se mide el valor (ej. mg/dL, %, etc.)."),
      rangoDeReferencia: z.string().describe("El rango normal o de referencia para el examen."),
  })).describe("Una lista de los resultados de laboratorio encontrados en el documento."),
});


// Define the Genkit Flow for processing a document
const processDocumentFlow = defineFlow(
  {
    name: "processDocumentFlow",
    inputSchema: z.array(z.string()),
    outputSchema: z.object({
      transcription: z.string(),
      labResults: ExtractedLabValuesSchema,
    }),
  },
  async (documentDataUris) => {
    // Step 1: Perform OCR on the document images
    const ocrResponse = await run("extract-text", async () => {
      const llm = googleAI.model("gemini-1.5-flash");
      return await llm.generate({
        prompt: [
          {
            text: "Extrae el texto completo de las siguientes imágenes de un informe de laboratorio médico. Combina el texto de todas las páginas en un solo bloque de texto coherente.",
          },
          ...documentDataUris.map((uri) => ({media: {url: uri}})),
        ],
      });
    });

    const transcription = ocrResponse.text();
    logger.info(`OCR completed. Transcription length: ${transcription.length}`);

    if (!transcription || transcription.trim().length < 20) {
      throw new AIFlowError(
        "La transcripción del texto es demasiado corta para ser analizada."
      );
    }

    // Step 2: Extract structured lab values from the text
    const extractionResponse = await run("extract-lab-values", async () => {
      const llm = googleAI.model("gemini-1.5-flash");
      return await llm.generate({
        prompt: `Actúa como un experto en análisis de datos de laboratorio médico. Lee el siguiente texto extraído de un informe y extrae TODOS los valores de laboratorio que encuentres. Formatea la salida como un objeto JSON estructurado. Para cada resultado, incluye el nombre del examen, el valor, las unidades y el rango de referencia. Si un campo no está presente para un resultado, déjalo como un string vacío.
IMPORTANTE: La salida final DEBE ser exclusivamente el objeto JSON.

Aquí está el texto del documento:
${transcription}
`,
        output: {
          schema: ExtractedLabValuesSchema,
        },
      });
    });

    const labResults = extractionResponse.output();
    if (!labResults) {
      throw new AIFlowError("La IA no pudo extraer los valores de laboratorio.");
    }
    logger.info("Extracción de datos completada con éxito.");

    return {
      transcription,
      labResults,
    };
  }
);

export const processdocument = onDocumentCreated(
  {
    document: "users/{userId}/documents/{docId}",
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (event) => {
    const {userId, docId} = event.params;
    const snap = event.data;
    if (!snap) {
        logger.log(`No data associated with the event for document ${docId}.`);
        return;
    }
    const data = snap.data();

    // Guard: Only proceed if the status is 'pending'.
    if (data?.processingStatus !== 'pending' || !data.urls || data.urls.length === 0) {
      logger.log(`Document ${docId} status is not 'pending' or has no URLs. Skipping.`);
      return;
    }

    logger.info(`Processing document ${docId} for user ${userId}`);
    const docRef = snap.ref;

    try {
      await docRef.update({ processingStatus: 'processing' });
      logger.info(`Document ${docId} status updated to 'processing'.`);

      const result = await processDocumentFlow(data.urls);
      
      await docRef.update({
        transcription: result.transcription,
        labResults: result.labResults.results, // Save the array of results
        processingStatus: 'completed',
        processingError: null,
      });

      logger.info(`Successfully updated document ${docId} with extracted lab values.`);
    } catch (error: any) {
      logger.error(`Error processing document ${docId}:`, error);
      const errorMessage = error instanceof AIFlowError ? error.message : "Un error inesperado ocurrió durante el procesamiento.";
      await docRef.update({
        processingStatus: 'error',
        processingError: errorMessage,
      });
    }
  }
);
