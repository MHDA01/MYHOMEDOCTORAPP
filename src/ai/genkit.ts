import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

/**
 * La clave se lee en este orden:
 *   1. GOOGLE_GENAI_API_KEY  (nombre usado en .env.local y apphosting.yaml)
 *   2. GEMINI_API_KEY        (alias alternativo de la librería)
 * Si ninguna está definida el plugin lanza FAILED_PRECONDITION.
 */
const apiKey =
  process.env.GOOGLE_GENAI_API_KEY ||
  process.env.GEMINI_API_KEY;

export const ai = genkit({
  plugins: [googleAI({ apiKey })],
  model: 'googleai/gemini-2.0-flash',
});
