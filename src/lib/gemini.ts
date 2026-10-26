// ============================================================
// lib/gemini.ts — Cliente compartido de la API de Gemini
// Sustituye al proxy RouteLLM de Abacus AI, que dejó de responder con HTTP 402
// ("A valid payment method is required") al caducar su suscripción y dejó sin
// servicio a la teleorientación y al agente de crecimiento.
//
// Habla por el endpoint COMPATIBLE CON OPENAI, no por el nativo de Gemini, y la
// clave viaja en la cabecera `Authorization: Bearer`. El motivo es el formato de
// las claves: AI Studio ya no emite las clásicas `AIza…`, sino claves que
// empiezan por `AQ.`, y el endpoint nativo las rechaza por las dos vías
// (comprobado el 21-oct-2026: `?key=` da 401 ACCESS_TOKEN_TYPE_UNSUPPORTED y la
// cabecera Bearer da 401 "Expected OAuth 2 access token"). El endpoint
// compatible acepta las dos familias de clave, así que la del proyecto viejo
// sigue sirviendo y las nuevas también. mfm-academy lleva tiempo usándolo así.
//
// Lo que entra y sale de este módulo no cambió: `GeminiRequest` y `GeminiResult`
// siguen hablando en términos de Gemini (`contents`, `parts`, `inlineData`) y la
// traducción al formato OpenAI vive aquí dentro.
// ============================================================
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
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
  /**
   * Pide la respuesta como JSON que cumpla este esquema (el subconjunto de
   * OpenAPI que acepta Gemini). Sin esto, el modelo contesta en prosa y hay que
   * adivinar dónde empieza el JSON entre comillas de bloque.
   *
   * El esquema no es una garantía: quien lo use debe volver a validar lo que
   * llega antes de creérselo.
   */
  responseSchema?: Record<string, unknown>;
  timeoutMs?: number;
  /**
   * Reintentos ante fallas pasajeras: saturación (429), errores 5xx del servicio o
   * de red. No se reintenta un bloqueo, un 4xx de configuración ni un timeout (ya
   * se esperó el límite completo). Por defecto 0.
   */
  reintentos?: number;
}

/**
 * Lo que costó la llamada, cuando el proveedor lo informa.
 *
 * `cacheados` es la parte de la entrada que se cobró barata por el caché
 * implícito de Gemini: el prompt de sistema es idéntico en cada turno y pesa
 * unos 4.000 tokens, así que es con diferencia lo más caro de cada consulta. El
 * caché no se activa con código —es automático cuando el prefijo se repite—,
 * pero sin mirar este número no hay forma de saber si está ocurriendo, y el
 * análisis de precio depende de que ocurra.
 */
export interface GeminiUso {
  entrada: number;
  salida: number;
  cacheados: number;
}

export type GeminiResult =
  | { ok: true; text: string; uso?: GeminiUso }
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

/**
 * Traduce los `contents` de Gemini a los `messages` de OpenAI.
 *
 * La instrucción de sistema deja de ser un campo aparte y pasa a ser el primer
 * mensaje, con rol `system`. El rol `model` de Gemini se llama `assistant` aquí.
 * Un turno de solo texto va como cadena —que es lo que esperan los modelos— y
 * uno con fotos va como lista de partes, con cada imagen en un `data:` URI.
 */
function aMensajes(system: string, contents: GeminiContent[]) {
  const mensajes: Array<{ role: string; content: unknown }> = [{ role: 'system', content: system }];

  for (const turno of contents) {
    const role = turno.role === 'model' ? 'assistant' : 'user';
    const soloTexto = turno.parts.every((parte) => 'text' in parte);

    if (soloTexto) {
      mensajes.push({ role, content: turno.parts.map((parte) => ('text' in parte ? parte.text : '')).join('') });
      continue;
    }

    mensajes.push({
      role,
      content: turno.parts.map((parte) =>
        'text' in parte
          ? { type: 'text', text: parte.text }
          : {
              type: 'image_url',
              image_url: { url: `data:${parte.inlineData.mimeType};base64,${parte.inlineData.data}` },
            }
      ),
    });
  }

  return mensajes;
}

/**
 * El equivalente de `thinkingBudget` en este endpoint. 0 —el valor por defecto
 * de la app— es "no razones", que es lo que mantiene `maxTokens` como
 * presupuesto de salida puro. Cualquier otro valor deja que el modelo razone.
 */
function esfuerzoDeRazonamiento(presupuesto: number): string {
  return presupuesto === 0 ? 'none' : 'medium';
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
      const cuerpo: Record<string, unknown> = {
        model,
        messages: aMensajes(req.system, req.contents),
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1024,
      };
      if (withThinking) {
        cuerpo.reasoning_effort = esfuerzoDeRazonamiento(req.thinkingBudget ?? 0);
      }
      if (req.responseSchema) {
        cuerpo.response_format = {
          type: 'json_schema',
          json_schema: { name: 'respuesta', schema: req.responseSchema },
        };
      }

      return fetch(`${GEMINI_API_BASE}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Vale tanto para las claves clásicas `AIza…` como para las `AQ.…`
          // que emite AI Studio desde 2026. Ver la cabecera del archivo.
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(cuerpo),
        signal: controller.signal,
      });
    };

    // No todos los modelos aceptan el esfuerzo de razonamiento: las variantes
    // -lite devuelven 400 si se les manda. Si eso pasa, se reintenta sin el
    // parámetro (esos modelos no razonan por defecto).
    let response = await post(true);
    if (response.status === 400) {
      response = await post(false);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Sin detalle');
      return { ok: false, kind: 'http', status: response.status, detail };
    }

    const data = await response.json();

    const eleccion = data?.choices?.[0];

    // Aquí el filtro de contenido no viene en un campo aparte como el
    // `promptFeedback` del endpoint nativo: llega como motivo de terminación.
    if (eleccion?.finish_reason === 'content_filter') {
      return { ok: false, kind: 'blocked', detail: 'content_filter' };
    }

    const text: string = String(eleccion?.message?.content ?? '').trim();

    if (!text) {
      return { ok: false, kind: 'empty', detail: 'Respuesta sin texto' };
    }

    // El formato OpenAI pone los tokens cacheados en prompt_tokens_details.
    const u = data?.usage;
    const uso: GeminiUso | undefined = u
      ? {
          entrada: Number(u.prompt_tokens ?? 0),
          salida: Number(u.completion_tokens ?? 0),
          cacheados: Number(u.prompt_tokens_details?.cached_tokens ?? 0),
        }
      : undefined;

    return { ok: true, text, uso };
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      return { ok: false, kind: 'timeout', detail: 'La solicitud excedió el tiempo límite' };
    }
    return { ok: false, kind: 'http', detail: String(error?.message ?? error) };
  } finally {
    clearTimeout(timeoutId);
  }
}
