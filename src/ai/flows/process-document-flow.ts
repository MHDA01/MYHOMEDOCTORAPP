
'use server';
/**
 * @fileOverview An AI agent for processing and summarizing medical documents.
 *
 * - processMedicalDocument - A function that handles OCR and summarization.
 * - DocumentInput - The input type for the processing function.
 * - ProcessedDocumentOutput - The return type for the processing function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const DocumentInputSchema = z.object({
  documentDataUris: z.array(z.string())
    .describe(
      "An array of document images as data URIs, which must include a MIME type and use Base64 encoding. Format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

const ProcessedDocumentOutputSchema = z.object({
  transcription: z.string().describe("The full text extracted from the document images."),
  summary: z.object({
    diagnosticoPrincipal: z.string().describe("A primary diagnosis based on the findings."),
    hallazgosClave: z.array(z.string()).describe("A list of the most important findings, such as out-of-range results."),
    recomendaciones: z.array(z.string()).describe("A list of recommendations or next steps to follow."),
  }),
});
export type ProcessedDocumentOutput = z.infer<typeof ProcessedDocumentOutputSchema>;

export async function processMedicalDocument(input: DocumentInput): Promise<ProcessedDocumentOutput> {
  console.log(`[AI-FLOW-v1] Starting document processing for ${input.documentDataUris.length} images.`);
  return processDocumentFlow(input);
}

const processDocumentPrompt = ai.definePrompt({
  name: 'processDocumentPrompt',
  input: { schema: z.object({ transcription: z.string() }) },
  output: { schema: ProcessedDocumentOutputSchema.shape.summary },
  prompt: `Actúa como un asistente médico profesional. Lee el siguiente texto extraído de un estudio clínico y genera un resumen estructurado en español que sea fácil de entender para el paciente. Extrae la información clave y organízala en las siguientes secciones: "Diagnóstico Principal", "Hallazgos Clave" y "Recomendaciones". Sé conciso, preserva la terminología clínica esencial y evita sacar conclusiones más allá de los datos proporcionados.
IMPORTANTE: El resumen final DEBE ser exclusivamente en español.

Aquí está el texto del documento:
{{{transcription}}}
`,
});

const processDocumentFlow = ai.defineFlow(
  {
    name: 'processDocumentFlow',
    inputSchema: DocumentInputSchema,
    outputSchema: ProcessedDocumentOutputSchema,
  },
  async (input) => {
    // 1. OCR Step: Extract text from all images
    const ocrResponse = await ai.generate({
      prompt: [
        'Extrae el texto completo de las siguientes imágenes de documentos médicos. Combina el texto de todas las páginas en un solo bloque de texto.',
        ...input.documentDataUris.map(uri => ({ media: { url: uri } }))
      ],
    });

    const transcription = ocrResponse.text;
    console.log(`[AI-FLOW-v1] OCR completed. Transcription length: ${transcription.length}`);

    if (!transcription || transcription.trim().length < 20) {
        console.warn("[AI-FLOW-v1] Transcription is too short, returning empty summary.");
        return {
            transcription: transcription || "No se pudo extraer texto del documento.",
            summary: {
                diagnosticoPrincipal: "No se pudo analizar",
                hallazgosClave: ["El documento no contiene suficiente texto para generar un resumen."],
                recomendaciones: ["Verifica la calidad de las imágenes e inténtalo de nuevo."]
            }
        };
    }
    
    // 2. Summarization Step
    const { output: summary } = await processDocumentPrompt({ transcription });
    
    if (!summary) {
      console.error("[AI-FLOW-v1] AI failed to generate a summary.");
      throw new Error("La IA no pudo generar un resumen.");
    }
    
    console.log(`[AI-FLOW-v1] Summarization completed.`);

    return {
      transcription,
      summary,
    };
  }
);
