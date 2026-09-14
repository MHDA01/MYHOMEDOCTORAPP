import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  getSecureMessages,
  persistSecureMessage,
  sendTeleorientacionMessage,
  type PatientStructuredContext,
} from '@/app/actions/teleorientacion';
import { crearUsuario, fetchFalso, respuestaGemini, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

const paciente: PatientStructuredContext = {
  firstName: 'Ana',
  lastName: 'Pérez',
  age: 34,
  sex: 'f',
  allergies: ['penicilina'],
  medications: ['levotiroxina'],
};

async function crearConversacion(uid: string, id = 'c1') {
  await getAdminDb().doc(`Cuentas_Tutor/${uid}/conversaciones/${id}`).set({ status: 'active' });
  return id;
}

let ana: UsuarioDePrueba;
let beto: UsuarioDePrueba;

beforeEach(async () => {
  await vaciarFirestore();
  ana = await crearUsuario();
  beto = await crearUsuario();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Guardar mensajes (persistSecureMessage)', () => {
  it('guarda el mensaje cifrado en la conversación de quien tiene la sesión', async () => {
    const convId = await crearConversacion(ana.uid);
    const resultado = await persistSecureMessage(ana.idToken, convId, { role: 'user', content: 'Me duele la cabeza' });
    expect(resultado).toEqual({ success: true });

    const mensajes = await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/conversaciones/${convId}/mensajes`).get();
    expect(mensajes.size).toBe(1);
    const guardado = mensajes.docs[0].data();
    expect(guardado.isEncrypted).toBe(true);
    expect(guardado.content).not.toContain('cabeza');
  });

  it('rechaza una sesión falsa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const convId = await crearConversacion(ana.uid);
    const resultado = await persistSecureMessage('token-inventado', convId, { role: 'user', content: 'hola' });
    expect(resultado.success).toBe(false);
  });

  it('no permite escribir en la conversación de otra cuenta aunque se conozca su id', async () => {
    const convId = await crearConversacion(ana.uid, 'conversacion-de-ana');
    const resultado = await persistSecureMessage(beto.idToken, convId, { role: 'user', content: 'mensaje falso' });
    expect(resultado).toEqual({ success: false, error: 'Conversación no encontrada.' });

    const mensajesDeAna = await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/conversaciones/${convId}/mensajes`).get();
    expect(mensajesDeAna.size).toBe(0);
  });

  it('rechaza ids de conversación con barras (rutas inyectadas)', async () => {
    const resultado = await persistSecureMessage(ana.idToken, `c1/mensajes/x`, { role: 'user', content: 'hola' });
    expect(resultado.success).toBe(false);
  });
});

describe('Leer mensajes (getSecureMessages)', () => {
  it('devuelve los mensajes descifrados y en orden a su dueña', async () => {
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'user', content: 'Primero' });
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Segundo' });

    const mensajes = await getSecureMessages(ana.idToken, convId);
    expect(mensajes.map((m) => [m.role, m.content])).toEqual([
      ['user', 'Primero'],
      ['assistant', 'Segundo'],
    ]);
  });

  it('otra cuenta no obtiene los mensajes aunque conozca el id', async () => {
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'user', content: 'Privado' });
    expect(await getSecureMessages(beto.idToken, convId)).toEqual([]);
  });
});

describe('Consulta con la Dra. Hilda (sendTeleorientacionMessage)', () => {
  it('sin sesión no llama a la IA', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    vi.stubGlobal('fetch', falso);

    const resultado = await sendTeleorientacionMessage([{ role: 'user', content: 'hola' }], paciente, '');
    expect(resultado.success).toBe(false);
    expect(llamadasGemini).toHaveLength(0);
  });

  it('envía el historial y el contexto del paciente, y devuelve la respuesta', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('Te recomiendo hidratarte.'));
    vi.stubGlobal('fetch', falso);

    const resultado = await sendTeleorientacionMessage(
      [
        { role: 'user', content: 'Tengo fiebre' },
        { role: 'assistant', content: '¿Desde cuándo?' },
        { role: 'user', content: 'Desde ayer' },
      ],
      paciente,
      ana.idToken
    );

    expect(resultado).toEqual({ success: true, message: 'Te recomiendo hidratarte.' });
    expect(llamadasGemini).toHaveLength(1);
    const { cuerpo } = llamadasGemini[0];
    expect(cuerpo.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    const sistema = cuerpo.systemInstruction.parts[0].text as string;
    expect(sistema).toContain('Dra. Hilda');
    expect(sistema).toContain('Nombre: Ana Pérez');
    expect(sistema).toContain('Alergias: penicilina');
  });

  it('manda las fotos a la IA como imagen, no como texto', async () => {
    const { falso, llamadasGemini } = fetchFalso((url) =>
      url.includes('fotos.ejemplo.test')
        ? new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } })
        : respuestaGemini('Veo la lesión.')
    );
    vi.stubGlobal('fetch', falso);

    const resultado = await sendTeleorientacionMessage(
      [{ role: 'user', content: '', imageUrls: ['https://fotos.ejemplo.test/lunar.jpg'] }],
      paciente,
      ana.idToken
    );

    expect(resultado.success).toBe(true);
    const partes = llamadasGemini[0].cuerpo.contents[0].parts;
    expect(partes[1].inlineData.mimeType).toBe('image/jpeg');
    expect(partes[1].inlineData.data).toBe(Buffer.from([0xff, 0xd8, 0xff]).toString('base64'));
  });

  it('corta en 20 mensajes por hora por cuenta', async () => {
    await getAdminDb().doc(`rate_limits/${ana.uid}`).set({ count: 20, windowStart: Date.now(), lastRequest: Date.now() });
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    vi.stubGlobal('fetch', falso);

    const resultado = await sendTeleorientacionMessage([{ role: 'user', content: 'hola' }], paciente, ana.idToken);
    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain('20 mensajes por hora');
    expect(llamadasGemini).toHaveLength(0);
  });

  it('si Gemini bloquea el contenido, lo dice sin mostrar detalles técnicos', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { falso } = fetchFalso(
      () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 })
    );
    vi.stubGlobal('fetch', falso);

    const resultado = await sendTeleorientacionMessage([{ role: 'user', content: 'hola' }], paciente, ana.idToken);
    expect(resultado).toEqual({
      success: false,
      message: '',
      error: 'No puedo responder a ese contenido. Reformula tu consulta, por favor.',
    });
  });

  it('si Gemini falla, devuelve un error y no revienta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { falso } = fetchFalso(() => new Response('Service Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', falso);

    const resultado = await sendTeleorientacionMessage([{ role: 'user', content: 'hola' }], paciente, ana.idToken);
    expect(resultado.success).toBe(false);
    expect(resultado.error).toContain('503');
  });
});
