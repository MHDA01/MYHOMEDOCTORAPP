import { randomUUID } from 'node:crypto';

export const PROYECTO = 'demo-mhda';

/** fetch real, guardado antes de que alguna prueba lo reemplace por uno falso. */
const fetchReal: typeof fetch = globalThis.fetch.bind(globalThis);

export type UsuarioDePrueba = { uid: string; idToken: string; email: string };

/** Crea una cuenta en el emulador de Auth y devuelve su ID token. */
export async function crearUsuario(email?: string): Promise<UsuarioDePrueba> {
  const correo = email ?? `prueba-${randomUUID()}@ejemplo.test`;
  const respuesta = await fetchReal(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=clave-falsa`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo, password: 'clave-del-emulador', returnSecureToken: true }),
    }
  );
  const datos = await respuesta.json();
  if (!datos.idToken) throw new Error(`El emulador de Auth no creó la cuenta: ${JSON.stringify(datos)}`);
  return { uid: datos.localId, idToken: datos.idToken, email: correo };
}

/** Borra todos los documentos del emulador de Firestore. */
export async function vaciarFirestore(): Promise<void> {
  await fetchReal(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

/**
 * Respuesta de Gemini con el formato de la API real: el del endpoint compatible
 * con OpenAI, que es por donde habla `src/lib/gemini.ts`.
 */
export function respuestaGemini(texto: string): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: texto }, finish_reason: 'stop' }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Lo que devuelve el endpoint NATIVO, que no tiene la forma del compatible:
 * candidatos con partes, y el uso en `usageMetadata` —donde los tokens de
 * razonamiento van en su propio campo.
 */
export function respuestaGeminiNativa(
  texto: string,
  uso?: { entrada?: number; salida?: number; cacheados?: number; pensados?: number }
): Response {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }],
      usageMetadata: {
        promptTokenCount: uso?.entrada ?? 0,
        candidatesTokenCount: uso?.salida ?? 0,
        cachedContentTokenCount: uso?.cacheados ?? 0,
        thoughtsTokenCount: uso?.pensados ?? 0,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

export type LlamadaGemini = { url: string; cuerpo: any };

/**
 * Reemplaza fetch: las llamadas a Gemini y a las URLs de imágenes las responde
 * `responder`; todo lo demás (emuladores) sigue yendo a la red local.
 */
export function fetchFalso(responder: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const llamadasGemini: LlamadaGemini[] = [];
  const falso = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
    if (url.includes('127.0.0.1') || url.includes('localhost')) return fetchReal(entrada, init);
    if (url.includes('generativelanguage.googleapis.com')) {
      llamadasGemini.push({ url, cuerpo: init?.body ? JSON.parse(String(init.body)) : undefined });
    }
    return responder(url, init);
  }) as typeof fetch;
  return { falso, llamadasGemini };
}
