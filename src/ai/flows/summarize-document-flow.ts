
'use server';
/**
 * @fileOverview A medical document summarization AI agent.
 *
 * - summarizeDocument - A function that handles the document summarization process.
 * - SummarizeDocumentInput - The input type for the summarizeDocument function.
 * - SummarizeDocumentOutput - The return type for the summarizeDocument function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeDocumentInputSchema = z.object({
  documentImages: z.array(z.string()).describe(
    "A list of document photos as data URIs. Each must include a MIME type and use Base64 encoding. E.g., 'data:<mimetype>;base64,<encoded_data>'."
  ),
});
export type SummarizeDocumentInput = z.infer<typeof SummarizeDocumentInputSchema>;

const SummarizeDocumentOutputSchema = z.object({
  summary: z.string().describe('A concise, structured summary of the key findings from the medical document.'),
});
export type SummarizeDocumentOutput = z.infer<typeof SummarizeDocumentOutputSchema>;


export async function summarizeDocument(input: SummarizeDocumentInput): Promise<SummarizeDocumentOutput> {
  return summarizeDocumentFlow(input);
}


const prompt = ai.definePrompt({
  name: 'summarizeDocumentPrompt',
  input: {schema: SummarizeDocumentInputSchema},
  output: {schema: SummarizeDocumentOutputSchema},
  prompt: `Eres un asistente médico experto. Tu tarea es analizar las imágenes de un documento médico y generar un resumen claro, estructurado y ÚNICAMENTE EN ESPAÑOL.

Identifica el tipo de documento y genera un resumen en formato Markdown según las siguientes directrices:

**1. Si es un Resultado de Laboratorio:**
Extrae los resultados clave en una tabla. Incluye solo los parámetros más relevantes o aquellos que estén fuera del rango normal.

Ejemplo de formato:
#### Resumen de Laboratorio
| Parámetro | Resultado | Rango Normal | Observaciones |
|-----------|-----------|--------------|---------------|
| Glucosa | **110 mg/dL** | 70-100 mg/dL | Ligeramente elevado |
| Colesterol | 190 mg/dL | < 200 mg/dL | Normal |
| Hemoglobina | **11.5 g/dL** | 12-15.5 g/dL | Ligeramente bajo |

**2. Si es un Informe de Imagen (Rayos X, Resonancia Magnética, Ecografía, etc.):**
Extrae los hallazgos principales y la conclusión o impresión diagnóstica del radiólogo.

Ejemplo de formato:
#### Resumen de Informe de Imagen
**Tipo de Estudio:** Radiografía de Tórax
**Hallazgos:**
- No se observan infiltrados ni derrames pleurales.
- Silueta cardíaca de tamaño normal.
- Estructuras óseas sin alteraciones visibles.
**Conclusión del Informe:**
- Estudio dentro de los límites de la normalidad.

**3. Si es una Receta Médica:**
Extrae los medicamentos prescritos en una tabla.

Ejemplo de formato:
#### Resumen de Receta Médica
| Medicamento | Dosis | Frecuencia | Duración |
|-------------|-------|------------|----------|
| Amoxicilina | 500 mg | Cada 8 horas | 7 días |
| Ibuprofeno | 400 mg | Cada 6 horas | Si hay dolor |
| Paracetamol | 1 g | PRN (según necesidad) | 3 días |

**4. Si es Otro tipo de documento (informe de alta, etc.):**
Genera un resumen conciso con los puntos más importantes en formato de lista.

Imágenes del documento a analizar:
{{#each documentImages}}
{{media url=this}}
{{/each}}
`,
});

const summarizeDocumentFlow = ai.defineFlow(
  {
    name: 'summarizeDocumentFlow',
    inputSchema: SummarizeDocumentInputSchema,
    outputSchema: SummarizeDocumentOutputSchema,
  },
  async input => {
    // If there are no images, return an empty summary
    if (input.documentImages.length === 0) {
        return { summary: '' };
    }

    const {output} = await prompt(input);
    return output!;
  }
);
