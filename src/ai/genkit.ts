import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI()],
  // model: 'googleai/gemini-2.0-flash', // Se elimina para permitir que cada flujo especifique su propio modelo
});
