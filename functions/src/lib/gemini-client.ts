/**
 * @fileoverview Cliente compartido para la API de Gemini (Google Generative
 * Language). Sustituye al antiguo proxy RouteLLM de Abacus AI, que dejó de
 * responder con HTTP 402 ("A valid payment method is required") al caducar su
 * suscripción y tumbó con ella la generación de contenido y los consejos diarios.
 */

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL_ID = "gemini-3.5-flash";
const REQUEST_TIMEOUT_MS = 30_000;

export interface GeminiOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /**
   * Presupuesto de razonamiento interno del modelo. Por defecto 0.
   *
   * Los modelos Gemini 3.x descuentan los tokens de razonamiento del mismo
   * maxOutputTokens que la respuesta visible, así que con presupuestos cortos
   * (los 250 tokens del consejo diario, por ejemplo) el texto llega truncado a
   * media frase con finishReason MAX_TOKENS. Con el presupuesto en 0, maxTokens
   * vuelve a ser presupuesto de salida puro y conserva el significado que tenía
   * con el modelo sin razonamiento que se usaba antes.
   */
  thinkingBudget?: number;
}

function resolveApiKey(): string {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no configurada en el entorno de funciones.");
  }
  return apiKey;
}

async function callGemini(
  system: string,
  userMessage: string,
  options: GeminiOptions,
  responseMimeType?: string
): Promise<string> {
  const apiKey = resolveApiKey();
  const model = options.model || DEFAULT_MODEL_ID;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 1000,
      thinkingConfig: { thinkingBudget: options.thinkingBudget ?? 0 },
    };
    if (responseMimeType) {
      generationConfig.responseMimeType = responseMimeType;
    }

    const response = await fetch(
      `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      throw new Error(`Gemini API error ${response.status}: ${await response.text()}`);
    }

    const data = (await response.json()) as any;

    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) {
      throw new Error(`Gemini bloqueó la petición por seguridad: ${blockReason}`);
    }

    const content = (data.candidates?.[0]?.content?.parts ?? [])
      .map((part: any) => part?.text ?? "")
      .join("")
      .trim();

    if (!content) {
      throw new Error(`Respuesta vacía de Gemini: ${JSON.stringify(data).slice(0, 500)}`);
    }
    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callGeminiText(
  system: string,
  userMessage: string,
  options: GeminiOptions = {}
): Promise<string> {
  return callGemini(system, userMessage, options);
}

/**
 * Igual que callGeminiText, pero pide y parsea JSON. Se le pasa a Gemini
 * responseMimeType "application/json", que garantiza sintaxis válida; la limpieza
 * de bloques ``` se conserva como red de seguridad por si el modelo los agrega.
 */
export async function callGeminiJson<T>(
  system: string,
  userMessage: string,
  options: GeminiOptions = {}
): Promise<T> {
  const raw = await callGemini(system, userMessage, options, "application/json");
  const jsonText = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(jsonText) as T;
  } catch (e) {
    throw new Error(`Gemini no devolvió JSON válido: ${jsonText.slice(0, 500)}`);
  }
}
