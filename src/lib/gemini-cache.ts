// ============================================================
// lib/gemini-cache.ts — Caché explícito del prompt de sistema
// ============================================================
//
// Qué resuelve. El prompt de sistema de Hilda son ~4.000 tokens idénticos en
// cada turno y es, con diferencia, lo más caro de una consulta. Gemini los cobra
// al 10 % si reconoce el prefijo repetido, pero su caché **implícito** es
// oportunista: por el endpoint compatible con OpenAI no pegaba nunca, y por el
// nativo pega a veces (89 % en una de tres llamadas medidas el 6-nov-2026).
// El caché **explícito** convierte ese "a veces" en "siempre": se sube el prompt
// una vez, Google devuelve un identificador y los turnos siguientes lo citan en
// vez de reenviarlo.
//
// ⚠️ POR QUÉ LA VIDA ES CORTA, Y NO DE UNA HORA.
//
// El caché explícito **cobra almacenamiento por hora** mientras existe, lo use
// alguien o no. Ese detalle invierte la cuenta cuando hay poco tráfico:
//
//   - Guardar ~4.000 tokens cuesta del orden de USD 1,00 por millón de tokens
//     y por hora. Una hora de caché ≈ USD 0,004 ≈ COP 13.
//   - Cada turno que lo aprovecha ahorra 4.000 × (1,50 − 0,15) / 1.000.000
//     ≈ USD 0,0054 ≈ COP 17.
//
// Con una vida de una hora y la app casi sin uso, el caché pasaría la mayor
// parte del tiempo vacío y cobrando: habría que superar varios cientos de turnos
// al mes solo para empatar. Con una vida de diez minutos que se renueva sola
// mientras haya conversación, una consulta de ocho turnos paga unos COP 2 de
// almacenamiento y ahorra unos COP 119. Y si nadie consulta, el caché se vence y
// deja de costar.
//
// Por eso no hay que subir VIDA_SEGUNDOS "para que rinda más": rinde más
// justamente por ser corta.
//
// Nada de esto es obligatorio: si algo falla —la creación, el permiso, el
// mínimo de tokens que exige Google— se devuelve `null` y quien llama manda el
// prompt como siempre. El caché es un ahorro, nunca un requisito.

import { createHash } from 'node:crypto';

const GEMINI_API_NATIVA = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Vida del caché. Corta a propósito: ver la explicación de la cabecera.
 *
 * Cubre de sobra una consulta entera —los turnos de una conversación van
 * seguidos— y se renueva sola en cada uso, así que una conversación larga nunca
 * se queda sin él.
 */
export const VIDA_SEGUNDOS = 600;

/** Margen para no citar un caché que vence mientras la petición viaja. */
const MARGEN_MS = 30_000;

interface Entrada {
  nombre: string;
  venceEn: number;
  /** Creación en curso: evita que diez turnos a la vez suban diez cachés. */
  creando?: Promise<string | null>;
}

const cachesPorPrompt = new Map<string, Entrada>();

function clave(model: string, system: string): string {
  return `${model}:${createHash('sha256').update(system).digest('hex')}`;
}

/** Para las pruebas y para cuando el prompt cambia en caliente. */
export function olvidarCaches(): void {
  cachesPorPrompt.clear();
}

/**
 * Sube el prompt de sistema y devuelve el identificador del caché, o `null` si
 * no se pudo. Nunca lanza: un fallo aquí solo significa pagar el prompt entero,
 * que es lo que se hacía antes.
 */
async function crear(model: string, system: string, apiKey: string): Promise<string | null> {
  try {
    const respuesta = await fetch(`${GEMINI_API_NATIVA}/cachedContents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        // La API lo quiere con el prefijo `models/`, y el modelo del caché debe
        // coincidir exactamente con el de la llamada que lo cita.
        model: `models/${model}`,
        systemInstruction: { parts: [{ text: system }] },
        ttl: `${VIDA_SEGUNDOS}s`,
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => 'sin detalle');
      // El caso más probable y el menos preocupante: Google exige un mínimo de
      // tokens para cachear y el prompt no llega. No es una incidencia, así que
      // va sin la palabra "Error", que es por lo que filtra la alerta de Cloud
      // Run. Lo que pasa es que se sigue pagando el prompt entero.
      console.log(
        `[Gemini] No se pudo crear el caché del prompt (${respuesta.status}): ${detalle.slice(0, 200)}`
      );
      return null;
    }

    const datos = await respuesta.json();
    const nombre = typeof datos?.name === 'string' ? datos.name : null;
    if (nombre) {
      console.log(`[Gemini] Caché del prompt creado: ${nombre}, vive ${VIDA_SEGUNDOS} s`);
    }
    return nombre;
  } catch (error) {
    console.log(`[Gemini] No se pudo crear el caché del prompt: ${String(error).slice(0, 200)}`);
    return null;
  }
}

/**
 * El identificador del caché para este prompt, creándolo si hace falta.
 *
 * Devuelve `null` cuando no hay caché disponible, y entonces quien llama manda
 * el prompt como siempre.
 */
export async function cacheDelSistema(
  model: string,
  system: string,
  apiKey: string
): Promise<string | null> {
  const k = clave(model, system);
  const entrada = cachesPorPrompt.get(k);

  // Uno vigente, con margen para que no venza en pleno viaje.
  if (entrada && !entrada.creando && entrada.venceEn - MARGEN_MS > Date.now()) {
    return entrada.nombre;
  }
  // Ya hay alguien subiéndolo: esperar en vez de subir otro. Sin esto, los
  // primeros turnos simultáneos crearían un caché cada uno y se pagaría el
  // almacenamiento de todos.
  if (entrada?.creando) return entrada.creando;

  const creando = crear(model, system, apiKey).then((nombre) => {
    if (nombre) {
      cachesPorPrompt.set(k, { nombre, venceEn: Date.now() + VIDA_SEGUNDOS * 1000 });
    } else {
      // No se reintenta en cada turno: si el prompt no se puede cachear, no se
      // va a poder dentro de un segundo tampoco, y cada intento es una llamada.
      cachesPorPrompt.set(k, { nombre: '', venceEn: Date.now() + 60_000 });
    }
    return nombre;
  });

  cachesPorPrompt.set(k, { nombre: entrada?.nombre ?? '', venceEn: 0, creando });
  return creando;
}

/**
 * Olvida un caché que el servidor ya no reconoce.
 *
 * Pasa si venció antes de lo previsto o si alguien lo borró. Quien llama vuelve
 * a intentar la petición sin citarlo, y el siguiente turno creará uno nuevo.
 */
export function invalidarCache(model: string, system: string): void {
  cachesPorPrompt.delete(clave(model, system));
}

/** Un fallo que habla de un caché que ya no existe. */
export function esCacheInvalido(status: number | undefined, detalle: string): boolean {
  if (status !== 400 && status !== 403 && status !== 404) return false;
  return /cachedcontent|cached_content|CachedContent/i.test(detalle);
}
