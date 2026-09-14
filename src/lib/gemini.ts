// ============================================================
// lib/gemini.ts — Cliente compartido de la API de Gemini
// Sustituye al proxy RouteLLM de Abacus AI, que dejó de responder con HTTP 402
// ("A valid payment method is required") al caducar su suscripción y dejó sin
// servicio a la teleorientación y al agente de crecimiento.
// ============================================================
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiRequest {
  system: string;
  contents: GeminiContent[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /**
   * Presupuesto de razonamiento interno. Por defecto 0.
   *
   * Los modelos Gemini 3.x descuentan sus tokens de razonamiento del mismo
   * maxOutputTokens que la respuesta visible, así que dejarlo abierto haría que
   * las respuestas llegaran truncadas a media frase (finishReason MAX_TOKENS).
   * Con 0, maxTokens es presupuesto de salida puro y conserva el significado que
   * tenía con el modelo sin razonamiento que se usaba antes.
   */
  thinkingBudget?: number;
  timeoutMs?: number;
  /**
   * Reintentos ante fallas pasajeras: saturación (429), errores 5xx del servicio o
   * de red. No se reintenta un bloqueo, un 4xx de configuración ni un timeout (ya
   * se esperó el límite completo). Por defecto 0.
   */
  reintentos?: number;
}

export type GeminiResult =
  | { ok: true; text: string }
  | { ok: false; kind: 'timeout' | 'http' | 'blocked' | 'empty'; status?: number; detail: string };

const ESPERA_ENTRE_REINTENTOS_MS = 1500;

function esFallaPasajera(resultado: GeminiResult): boolean {
  if (resultado.ok || resultado.kind !== 'http') return false;
  // Sin status es un error de red (fetch lanzó), salvo que falte la clave.
  if (resultado.status === undefined) return !resultado.detail.includes('GEMINI_API_KEY');
  return resultado.status === 429 || resultado.status >= 500;
}

export async function generateWithGemini(req: GeminiRequest): Promise<GeminiResult> {
  const reintentos = Math.max(0, req.reintentos ?? 0);
  let resultado = await intentarGemini(req);
  for (let intento = 1; intento <= reintentos && esFallaPasajera(resultado); intento++) {
    await new Promise((resolver) => setTimeout(resolver, ESPERA_ENTRE_REINTENTOS_MS * intento));
    resultado = await intentarGemini(req);
  }
  return resultado;
}

async function intentarGemini(req: GeminiRequest): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: 'http', detail: 'GEMINI_API_KEY no configurada' };
  }

  const model = req.model || DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs ?? 60_000);

  try {
    const post = (withThinking: boolean) => {
      const generationConfig: Record<string, unknown> = {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 1024,
      };
      if (withThinking) {
        generationConfig.thinkingConfig = { thinkingBudget: req.thinkingBudget ?? 0 };
      }

      return fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: req.system }] },
          contents: req.contents,
          generationConfig,
        }),
        signal: controller.signal,
      });
    };

    // No todos los modelos aceptan thinkingBudget: gemini-3.6-flash y las
    // variantes -lite devuelven 400 si se les manda. Si eso pasa, se reintenta
    // sin el parámetro (esos modelos no razonan por defecto).
    let response = await post(true);
    if (response.status === 400) {
      response = await post(false);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Sin detalle');
      return { ok: false, kind: 'http', status: response.status, detail };
    }

    const data = await response.json();

    const blockReason = data?.promptFeedback?.blockReason;
    if (blockReason) {
      return { ok: false, kind: 'blocked', detail: String(blockReason) };
    }

    const text: string = (data?.candidates?.[0]?.content?.parts ?? [])
      .map((part: any) => part?.text ?? '')
      .join('')
      .trim();

    if (!text) {
      return { ok: false, kind: 'empty', detail: 'Respuesta sin texto' };
    }

    return { ok: true, text };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, kind: 'timeout', detail: 'La solicitud excedió el tiempo límite' };
    }
    return { ok: false, kind: 'http', detail: String(error?.message ?? error) };
  } finally {
    clearTimeout(timeoutId);
  }
}
