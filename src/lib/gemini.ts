// ============================================================
// lib/gemini.ts — Cliente compartido de la API de Gemini
// Sustituye al proxy RouteLLM de Abacus AI, que dejó de responder con HTTP 402
// ("A valid payment method is required") al caducar su suscripción y dejó sin
// servicio a la teleorientación y al agente de crecimiento.
//
// Tiene DOS caminos, y quien llama elige con `nativo`:
//
//  - **Compatible con OpenAI** (el de siempre, y el que sigue por defecto). La
//    clave viaja en `Authorization: Bearer`. Se eligió porque AI Studio dejó de
//    emitir las claves clásicas `AIza…` y empezó con las `AQ.`.
//  - **Nativo de Gemini** (`nativo: true`). La clave viaja en la cabecera
//    `x-goog-api-key`.
//
// CORRECCIÓN del 6-nov-2026. La cabecera de este archivo decía que el endpoint
// nativo rechazaba las claves `AQ.` por las dos vías, comprobado el 21-oct-2026.
// Vuelto a comprobar hoy con la clave del proyecto: `x-goog-api-key` da 200 y
// `?key=` da 200; solo `Authorization: Bearer` sigue dando 401 ("Expected OAuth
// 2 access token"), que es la vía que se había probado. Así que el camino nativo
// sí está disponible, y hace dos cosas que el compatible no:
//
//  1. **Cachea el prefijo repetido.** Medido hoy con un prompt de sistema de
//     relleno de ~18.000 tokens: una de tres llamadas reportó 16.054 tokens
//     cacheados (89 %). Por el endpoint compatible, nueve turnos reales de
//     Hilda dieron 0 % sin una sola excepción. El caché implícito es
//     oportunista —no pega siempre— pero por el otro camino no pega nunca.
//  2. **Dice cuánto pensó el modelo**, en `usageMetadata.thoughtsTokenCount`.
//     El compatible no lo reporta, y por eso no se podía saber si la
//     teleorientación estaba razonando o no.
//
// Lo que entra y sale de este módulo no cambió: `GeminiRequest` y `GeminiResult`
// siguen hablando en términos de Gemini (`contents`, `parts`, `inlineData`) y la
// traducción al formato OpenAI vive aquí dentro.
// ============================================================
import { cacheDelSistema, esCacheInvalido, invalidarCache } from '@/lib/gemini-cache';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
const GEMINI_API_NATIVA = 'https://generativelanguage.googleapis.com/v1beta';
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
   * Habla por el endpoint nativo de Gemini en vez del compatible con OpenAI.
   *
   * Lo pide la teleorientación por dos razones medidas el 6-nov-2026: es el
   * único de los dos donde el caché del prefijo llega a activarse (el prompt de
   * sistema son ~4.000 tokens idénticos en cada turno) y el único que reporta
   * los tokens de razonamiento. Ver la cabecera del archivo.
   *
   * Los demás usos siguen por el camino compatible: no tienen un prefijo
   * grande que repetir en cada llamada, así que no ganarían nada con el cambio
   * y no hay por qué moverlos.
   */
  nativo?: boolean;
  /**
   * Sube el prompt de sistema una vez y cítalo en los turnos siguientes, en vez
   * de reenviarlo entero cada vez (caché **explícito**, `src/lib/gemini-cache.ts`).
   *
   * Solo tiene efecto por el camino nativo. Vale la pena cuando `system` es
   * grande y se repite —el de la teleorientación son ~4.000 tokens idénticos en
   * cada turno—, y no vale la pena cuando es corto o cambia, porque el caché
   * cobra almacenamiento por hora. Por eso es opcional y no automático.
   *
   * Si el caché no se puede crear, la llamada sigue adelante mandando el prompt
   * como siempre: es un ahorro, nunca un requisito.
   *
   * ⚠️ Con el caché activo, `system` viaja DENTRO del caché y no en la
   * petición. Lo que cambie entre una llamada y otra —el contexto del paciente,
   * por ejemplo— no puede ir en `system`: tiene que ir en `contents`, o se
   * estaría cacheando algo distinto por cada paciente y el caché dejaría de
   * servir para nada.
   */
  cacheSistema?: boolean;
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
 * caché implícito no se enciende con código —es automático cuando el prefijo se
 * repite— pero es **oportunista**: por el camino nativo pega a veces (89 % en
 * una de tres llamadas medidas) y por el compatible no pegaba nunca. Sin mirar
 * este número no hay forma de saber si está ocurriendo, y el análisis de precio
 * depende de que ocurra.
 */
export interface GeminiUso {
  entrada: number;
  salida: number;
  cacheados: number;
  /**
   * Tokens que el modelo gastó pensando antes de contestar, cuando el
   * razonamiento está encendido. Por el camino nativo van **aparte** de
   * `salida` (`thoughtsTokenCount`); por el compatible con OpenAI no se
   * reportan y este campo queda en 0, que no es lo mismo que no haber pensado.
   *
   * Importa para la espera, no para la factura: el razonamiento ocurre **antes**
   * del primer token visible, así que es tiempo en el que el paciente mira la
   * pantalla sin que pase nada. Sin este número, el tramo "IA" de
   * `registrarTiempos` no se puede interpretar: no se distingue un modelo lento
   * de un modelo que estuvo pensando mucho, y son dos arreglos distintos.
   */
  razonamiento: number;
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
  const intentar = req.nativo ? intentarGeminiNativo : intentarGemini;
  let resultado = await intentar(req);
  for (let intento = 1; intento <= reintentos && esFallaPasajera(resultado); intento++) {
    await new Promise((resolver) => setTimeout(resolver, ESPERA_ENTRE_REINTENTOS_MS * intento));
    resultado = await intentar(req);
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
      // Deja rastro: hasta ahora este reintento era silencioso, y en la
      // teleorientación significa que la llamada se hizo SIN razonamiento
      // aunque el código lo pidiera. Sin esta línea no hay forma de saber, al
      // leer los registros, si el modelo pensó o si el parámetro se cayó.
      // No lleva la palabra "Error": la alerta de Cloud Run filtra por ese
      // texto y esto es información.
      console.log(
        `[Gemini] El modelo ${model} rechazó reasoning_effort; se reintenta sin razonamiento`
      );
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
          // El formato OpenAI los pone junto a los de salida. Si el modelo no
          // razona, el campo no viene y queda en 0.
          razonamiento: Number(u.completion_tokens_details?.reasoning_tokens ?? 0),
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

/**
 * El mismo trabajo por el endpoint nativo. Ver la cabecera del archivo.
 *
 * Tiene menos código que el compatible porque aquí no hay nada que traducir:
 * los `contents` de `GeminiRequest` ya están en el formato que espera la API,
 * con sus `parts` y sus `inlineData` para las fotos. Lo único que cambia de
 * sitio es la instrucción de sistema, que tiene campo propio en vez de ser el
 * primer mensaje de la lista.
 */
async function intentarGeminiNativo(req: GeminiRequest): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { ok: false, kind: 'http', detail: 'GEMINI_API_KEY no configurada' };
  }

  const model = req.model || DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), req.timeoutMs ?? 60_000);

  // El prompt de sistema va dentro del caché o en la petición, nunca en los
  // dos sitios: la API rechaza que se manden juntos.
  const cache = req.cacheSistema ? await cacheDelSistema(model, req.system, apiKey) : null;

  try {
    const post = (withThinking: boolean, conCache: string | null) => {
      const generationConfig: Record<string, unknown> = {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 1024,
      };
      // -1 es presupuesto dinámico: lo decide el modelo. 0 apaga el
      // razonamiento, como `reasoning_effort: 'none'` en el otro camino.
      if (withThinking) {
        generationConfig.thinkingConfig = { thinkingBudget: req.thinkingBudget ?? 0 };
      }
      if (req.responseSchema) {
        generationConfig.responseMimeType = 'application/json';
        generationConfig.responseSchema = req.responseSchema;
      }

      const cuerpo: Record<string, unknown> = { contents: req.contents, generationConfig };
      if (conCache) cuerpo.cachedContent = conCache;
      else cuerpo.systemInstruction = { parts: [{ text: req.system }] };

      return fetch(`${GEMINI_API_NATIVA}/models/${model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // La vía que sí acepta las claves `AQ.`; `Bearer` da 401 aquí.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(cuerpo),
        signal: controller.signal,
      });
    };

    let response = await post(true, cache);
    if (response.status === 400) {
      console.log(
        `[Gemini] El modelo ${model} rechazó thinkingConfig; se reintenta sin razonamiento`
      );
      response = await post(false, cache);
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => 'Sin detalle');
      // Un caché que el servidor ya no reconoce —venció antes de tiempo, o
      // alguien lo borró— no puede tumbar la consulta: se olvida y se repite la
      // llamada mandando el prompt entero, que es lo que se hacía antes de
      // existir el caché. El turno sale más caro; el paciente no se entera.
      if (cache && esCacheInvalido(response.status, detail)) {
        console.log('[Gemini] El caché del prompt ya no existe; se reintenta sin él');
        invalidarCache(model, req.system);
        const reintento = await post(true, null);
        if (reintento.ok) {
          response = reintento;
        } else {
          const detalleReintento = await reintento.text().catch(() => 'Sin detalle');
          return { ok: false, kind: 'http', status: reintento.status, detail: detalleReintento };
        }
      } else {
        return { ok: false, kind: 'http', status: response.status, detail };
      }
    }

    const data = await response.json();

    // El filtro de contenido llega por dos vías: el prompt rechazado de entrada
    // (`promptFeedback`) o la respuesta cortada por seguridad.
    const candidato = data?.candidates?.[0];
    const bloqueo = data?.promptFeedback?.blockReason;
    if (bloqueo) {
      return { ok: false, kind: 'blocked', detail: String(bloqueo) };
    }
    if (candidato?.finishReason === 'SAFETY' || candidato?.finishReason === 'PROHIBITED_CONTENT') {
      return { ok: false, kind: 'blocked', detail: String(candidato.finishReason) };
    }

    const partes = Array.isArray(candidato?.content?.parts) ? candidato.content.parts : [];
    const text: string = partes
      .map((parte: { text?: string }) => parte?.text ?? '')
      .join('')
      .trim();

    if (!text) {
      // Un `MAX_TOKENS` sin texto es justo lo que avisa el comentario de
      // `THINKING_BUDGET`: el razonamiento se comió el presupuesto de salida.
      // Por eso el motivo va en el detalle en vez de perderse.
      return {
        ok: false,
        kind: 'empty',
        detail: `Respuesta sin texto (${candidato?.finishReason ?? 'sin motivo'})`,
      };
    }

    const u = data?.usageMetadata;
    const uso: GeminiUso | undefined = u
      ? {
          entrada: Number(u.promptTokenCount ?? 0),
          salida: Number(u.candidatesTokenCount ?? 0),
          cacheados: Number(u.cachedContentTokenCount ?? 0),
          razonamiento: Number(u.thoughtsTokenCount ?? 0),
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
