
'use server';
/**
 * @fileOverview Un agente de IA para resumir documentos médicos.
 *
 * - summarizeMedicalDocument - Una función que maneja el proceso de resumen.
 * - DocumentInput - El tipo de entrada para la función de resumen.
 * - SummaryResponse - El tipo de retorno para la función de resumen.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

const DocumentInputSchema = z.object({
  documentDataUris: z.array(z.string())
    .describe(
      "Un array de imágenes de un documento como data URIs, que deben incluir un MIME type y usar codificación Base64. Formato esperado: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type DocumentInput = z.infer<typeof DocumentInputSchema>;

const SummaryResponseSchema = z.object({
  diagnosticoPrincipal: z.string().describe("Un diagnóstico principal basado en los hallazgos."),
  hallazgosClave: z.array(z.string()).describe("Una lista de los hallazgos más importantes del estudio, como resultados fuera de rango."),
  recomendaciones: z.array(z.string()).describe("Una lista de recomendaciones o próximos pasos a seguir."),
});
export type SummaryResponse = z.infer<typeof SummaryResponseSchema>;

export async function summarizeMedicalDocument(input: DocumentInput): Promise<SummaryResponse> {
  return summarizeDocumentFlow(input);
}

const prompt = ai.definePrompt({
  name: 'summarizeDocumentPrompt',
  input: { schema: DocumentInputSchema },
  output: { schema: SummaryResponseSchema },
  prompt: `Actúa como un asistente médico profesional. Lee el siguiente estudio clínico compuesto por una o varias imágenes y genera un resumen estructurado en español que sea fácil de entender para el paciente. Extrae la información clave y organízala en las siguientes secciones: "Diagnóstico Principal", "Hallazgos Clave" y "Recomendaciones".
IMPORTANTE: El resumen final DEBE ser exclusivamente en español.

Aquí están las imágenes del documento:
{{#each documentDataUris}}
{{media url=this}}
{{/each}}
`,
});

const summarizeDocumentFlow = ai.defineFlow(
  {
    name: 'summarizeDocumentFlow',
    inputSchema: DocumentInputSchema,
    outputSchema: SummaryResponseSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output) {
      throw new Error("La IA no pudo generar un resumen.");
    }
    return output;
  }
);
