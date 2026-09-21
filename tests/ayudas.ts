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

/** Respuesta de Gemini con el formato de la API real. */
export function respuestaGemini(texto: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: texto }] } }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
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

/** Llamadas del agente lector (piden JSON) y del redactor (texto para el paciente). */
export function esLlamadaDelLector(llamada: LlamadaGemini): boolean {
  return llamada.cuerpo?.generationConfig?.responseMimeType === 'application/json';
}

export function llamadasDelRedactor(llamadas: LlamadaGemini[]): LlamadaGemini[] {
  return llamadas.filter((l) => !esLlamadaDelLector(l));
}

/** Lectura que el agente lector devolvería; por defecto, "nada que reportar". */
export function respuestaLector(lectura: {
  motivo_id?: string;
  edad_anios?: number | null;
  signos?: Array<{ id: string; estado: string; evidencia: string }>;
  preguntas_respondidas?: string[];
} = {}): Response {
  return respuestaGemini(
    JSON.stringify({ motivo_id: 'ninguno', edad_anios: null, signos: [], preguntas_respondidas: [], ...lectura })
  );
}

/**
 * Responde distinto al lector y al redactor. Cada función recibe el número de
 * llamada de su tipo (1, 2, ...) y el cuerpo enviado.
 */
export function fetchPorAgente(respuestas: {
  lector?: (n: number, cuerpo: any) => Response | Promise<Response>;
  redactor: (n: number, cuerpo: any) => Response | Promise<Response>;
}) {
  let nLector = 0;
  let nRedactor = 0;
  return fetchFalso((_url, init) => {
    const cuerpo = init?.body ? JSON.parse(String(init.body)) : undefined;
    if (cuerpo?.generationConfig?.responseMimeType === 'application/json') {
      return (respuestas.lector ?? (() => respuestaLector()))(++nLector, cuerpo);
    }
    return respuestas.redactor(++nRedactor, cuerpo);
  });
}
