
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
  prompt: `You are an expert medical assistant. Your task is to analyze the provided images of a medical document (lab result, imaging report, prescription, etc.) and generate a clear, concise, and structured summary.

Focus on extracting the most critical information. The summary should be easy to understand for a patient but accurate for a doctor.

- Identify the type of document.
- Note any key dates, doctor names, or facility names.
- List the most important findings, values, or prescribed treatments.
- If it's a lab result, highlight any values that are outside the normal range.
- Conclude with a simple one-sentence takeaway or recommendation if present.

Present the summary in markdown format.

Images:
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
