'use server';

// ============================================================
// app/actions/voz-hilda.ts — La voz de Hilda, sintetizada en servidor
// ============================================================
//
// Por qué existe: el sintetizador del navegador es gratis y privado, pero suena
// a máquina, y en el modo conversación la voz es toda la experiencia — quien lo
// usa no va a leer la pantalla. Esto devuelve la MISMA voz que el personaje
// tiene en los videos de Flow ("Erinome"), por Google Cloud Text-to-Speech.
//
// Lo que cuesta: se cobra por carácter (el primer millón de cada mes es
// gratis). Una respuesta ronda los 500 caracteres. Por eso esto solo se llama
// desde el modo conversación, nunca desde el chat escrito, y solo con sesión
// iniciada: un endpoint abierto sería un sintetizador gratis para cualquiera a
// cuenta del proyecto.
//
// Lo que sale de aquí: el texto clínico de la respuesta viaja a la API de
// Text-to-Speech de Google, el mismo proveedor y el mismo proyecto que ya
// atiende la conversación. No abre un tercero nuevo, pero debe decirlo el aviso
// de privacidad.

import { JWT } from 'google-auth-library';
import { getAdminAuth } from '@/lib/firebase-admin';
import { FRASES_FIJAS } from '@/lib/voz';

/**
 * Erinome en la familia Chirp 3 HD, acento latinoamericano. Es la voz guardada
 * del personaje en Flow. La familia Gemini-TTS tiene la misma voz y además
 * admite indicaciones de interpretación, pero la sirve Vertex AI y exige el rol
 * `roles/aiplatform.user` en la cuenta de servicio; el día que se conceda, se
 * cambia aquí.
 */
const VOZ = 'es-US-Chirp3-HD-Erinome';
const IDIOMA = 'es-US';
const TTS_URL = 'https://texttospeech.googleapis.com/v1/text:synthesize';

/** Tope por petición. Más que esto no es una respuesta de Hilda, es un error. */
const MAX_CARACTERES = 1200;

export type VozResultado =
  | { ok: true; audio: string; mimeType: 'audio/mpeg' }
  | { ok: false; error: string };

/**
 * Audio guardado de las frases que nunca cambian.
 *
 * Qué se guarda y qué no: **solo** las frases fijas de la aplicación, nunca una
 * respuesta de Hilda. Las respuestas son distintas en cada consulta, así que no
 * se repetirían nunca, y además son texto clínico de un paciente: no tienen por
 * qué quedarse en la memoria del servidor.
 *
 * Lo que esto ahorra es **tiempo, no dinero**. El saludo son 33 caracteres: su
 * costo es indistinguible de cero. Lo que vale es que se dice al abrir el modo
 * conversación, y sin esto cada sesión empieza con dos segundos de silencio
 * esperando a que Google lo sintetice — justo en el momento en que el paciente
 * acaba de tocar el botón y no sabe si la aplicación lo oyó.
 */
const audioDeFrasesFijas = new Map<string, string>();

let credencial: JWT | null = null;

function obtenerCredencial(): JWT {
  if (credencial) return credencial;
  // Los dos nombres, como en `firebase-admin.ts`: en producción las variables
  // llevan el prefijo `MHD_` (así están declaradas en `apphosting.yaml`) y en
  // `.env.local` no lo llevan. Leer solo el nombre corto es justo el fallo que
  // dejó a Hilda hablando con la voz del navegador en producción el 26-oct:
  // aquí se lanzaba el error, la acción fallaba y el hook caía al respaldo.
  const email = process.env.MHD_FIREBASE_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const clave = (process.env.MHD_FIREBASE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(
    /\\n/g,
    '\n'
  );
  if (!email || !clave) {
    // Se dice QUÉ falta: el fallo anterior se veía en los registros como un
    // error genérico y había que leer el código para saber qué buscar.
    throw new Error(
      `Faltan las credenciales de la cuenta de servicio para la voz (correo: ${email ? 'sí' : 'no'}, clave: ${clave ? 'sí' : 'no'})`
    );
  }
  credencial = new JWT({
    email,
    key: clave,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  return credencial;
}

/**
 * Convierte un trozo de respuesta de Hilda en audio.
 *
 * Devuelve el MP3 en base64. Quien llama trocea el texto y pide los trozos de
 * uno en uno, para poder empezar a reproducir el primero mientras se generan
 * los demás: una respuesta entera tarda más de dos segundos y esa espera, en
 * una conversación hablada, se nota demasiado.
 */
export async function sintetizarVozHilda(idToken: string, texto: string): Promise<VozResultado> {
  if (!idToken) return { ok: false, error: 'Sesión inválida.' };

  try {
    await getAdminAuth().verifyIdToken(idToken);
  } catch {
    // Sin ruido en los registros: una sesión vencida no es una incidencia.
    return { ok: false, error: 'Sesión inválida o expirada.' };
  }

  const limpio = (texto ?? '').trim();
  if (!limpio) return { ok: false, error: 'Sin texto que decir.' };
  if (limpio.length > MAX_CARACTERES) return { ok: false, error: 'Texto demasiado largo.' };

  const esFija = FRASES_FIJAS.has(limpio);
  const guardado = esFija ? audioDeFrasesFijas.get(limpio) : undefined;
  if (guardado) return { ok: true, audio: guardado, mimeType: 'audio/mpeg' };

  try {
    const { token } = await obtenerCredencial().getAccessToken();
    if (!token) return { ok: false, error: 'No se pudo autenticar la síntesis de voz.' };

    const respuesta = await fetch(TTS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-goog-user-project':
          process.env.MHD_FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: limpio },
        voice: { languageCode: IDIOMA, name: VOZ },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => 'sin detalle');
      console.error(`[Dra. Hilda] Error de voz (http ${respuesta.status}): ${detalle.slice(0, 500)}`);
      return { ok: false, error: 'No se pudo generar la voz.' };
    }

    const datos = await respuesta.json();
    if (!datos?.audioContent) {
      console.error('[Dra. Hilda] Error de voz: la API contestó sin audio');
      return { ok: false, error: 'No se pudo generar la voz.' };
    }

    const audio = datos.audioContent as string;
    if (esFija) audioDeFrasesFijas.set(limpio, audio);
    return { ok: true, audio, mimeType: 'audio/mpeg' };
  } catch (error) {
    console.error('[Dra. Hilda] Error de voz inesperado:', error);
    return { ok: false, error: 'No se pudo generar la voz.' };
  }
}
