import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb, getAdminStorage } from '@/lib/firebase-admin';
import {
  enviarMensajeConsulta,
  getSecureMessages,
  persistSecureMessage,
  saludarEnConsulta,
  type PatientStructuredContext,
} from '@/app/actions/teleorientacion';
import { AVISO_URGENCIAS, IMAGEN_NO_VALIDA, MENSAJE_MUY_LARGO } from '@/lib/textos-chat';
import { crearUsuario, fetchFalso, respuestaGemini, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

const BUCKET = 'demo-mhda.appspot.com';

const paciente: PatientStructuredContext = {
  firstName: 'Ana',
  lastName: 'Pérez',
  age: 34,
  sex: 'f',
  allergies: ['penicilina'],
  medications: ['levotiroxina'],
};

async function crearConversacion(uid: string, id = 'c1') {
  await getAdminDb().doc(`Cuentas_Tutor/${uid}/conversaciones/${id}`).set({ status: 'active', createdAt: new Date('2026-09-01T10:00:00Z') });
  return id;
}

async function mensajesGuardados(uid: string, convId: string) {
  const snap = await getAdminDb().collection(`Cuentas_Tutor/${uid}/conversaciones/${convId}/mensajes`).orderBy('timestamp').get();
  return snap.docs.map((d) => d.data());
}

/** Sube una foto al emulador de Storage y devuelve su URL de descarga con el formato real. */
async function subirFoto(ruta: string, bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0]), contentType = 'image/jpeg') {
  await getAdminStorage().bucket(BUCKET).file(ruta).save(bytes, { contentType });
  return `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${BUCKET}/o/${encodeURIComponent(ruta)}?alt=media`;
}

function silenciarErrores() {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
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

describe('Textos de sistema y lectura (persistSecureMessage / getSecureMessages)', () => {
  it('guarda el texto cifrado y lo marca como de sistema si se pide', async () => {
    const convId = await crearConversacion(ana.uid);
    expect(await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Consulta cerrada', sistema: true })).toEqual({ success: true });

    const [guardado] = await mensajesGuardados(ana.uid, convId);
    expect(guardado.isEncrypted).toBe(true);
    expect(guardado.content).not.toContain('cerrada');
    expect(guardado.origen).toBe('sistema');
  });

  it('no permite escribir en la conversación de otra cuenta aunque se conozca su id', async () => {
    silenciarErrores();
    const convId = await crearConversacion(ana.uid, 'conversacion-de-ana');
    expect(await persistSecureMessage(beto.idToken, convId, { role: 'user', content: 'falso' })).toEqual({ success: false, error: 'Conversación no encontrada.' });
    expect(await persistSecureMessage('token-inventado', convId, { role: 'user', content: 'falso' })).toMatchObject({ success: false });
    expect(await persistSecureMessage(ana.idToken, 'c1/mensajes/x', { role: 'user', content: 'falso' })).toMatchObject({ success: false });
    expect(await mensajesGuardados(ana.uid, convId)).toHaveLength(0);
  });

  it('devuelve los mensajes descifrados solo a su dueña', async () => {
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'user', content: 'Primero' });
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Segundo' });

    expect((await getSecureMessages(ana.idToken, convId)).map((m) => [m.role, m.content])).toEqual([
      ['user', 'Primero'],
      ['assistant', 'Segundo'],
    ]);
    expect(await getSecureMessages(beto.idToken, convId)).toEqual([]);
  });
});

describe('Enviar un mensaje a la Dra. Hilda (enviarMensajeConsulta)', () => {
  it('sin sesión o en una conversación ajena no llama a la IA ni guarda nada', async () => {
    silenciarErrores();
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    expect((await enviarMensajeConsulta('', convId, { texto: 'hola' }, paciente)).success).toBe(false);
    expect((await enviarMensajeConsulta(beto.idToken, convId, { texto: 'hola' }, paciente)).success).toBe(false);
    expect(llamadasGemini).toHaveLength(0);
    expect(await mensajesGuardados(ana.uid, convId)).toHaveLength(0);
  });

  it('el servidor guarda la pregunta y la respuesta, cifradas, y no reescribe la fecha de creación', async () => {
    const { falso } = fetchFalso(() => respuestaGemini('Te recomiendo hidratarte.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Tengo fiebre' }, paciente);
    expect(resultado).toEqual({ success: true, message: 'Te recomiendo hidratarte.' });

    const guardados = await mensajesGuardados(ana.uid, convId);
    expect(guardados.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(guardados.every((m) => m.isEncrypted && !String(m.content).includes('fiebre'))).toBe(true);

    const conversacion = (await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/conversaciones/${convId}`).get()).data()!;
    expect(conversacion.createdAt.toDate().toISOString()).toBe('2026-09-01T10:00:00.000Z');
    expect(conversacion.messageCount).toBe(2);
  });

  it('arma el historial desde la base de datos, sin los textos de sistema, con el contexto del paciente', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('Desde ayer entonces.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Hola, soy la Dra. Hilda' });
    await persistSecureMessage(ana.idToken, convId, { role: 'user', content: 'Tengo fiebre' });
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Error del servicio de IA 503', sistema: true });

    await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Desde ayer' }, paciente);

    const { cuerpo } = llamadasGemini[0];
    const textos = cuerpo.contents.map((c: any) => [c.role, c.parts[0].text]);
    expect(textos).toEqual([
      ['model', 'Hola, soy la Dra. Hilda'],
      ['user', 'Tengo fiebre'],
      ['user', 'Desde ayer'],
    ]);
    const sistema = cuerpo.systemInstruction.parts[0].text as string;
    expect(sistema).toContain('Dra. Hilda');
    expect(sistema).toContain('Nombre: Ana Pérez');
    expect(sistema).toContain('Alergias: penicilina');
  });

  it('manda a la IA las fotos de la carpeta de la conversación como imagen', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('Veo la lesión.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);
    const url = await subirFoto(`medical-images/${ana.uid}/${convId}/lunar.jpg`);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: '', imageUrls: [url] }, paciente);
    expect(resultado.success).toBe(true);

    const partes = llamadasGemini[0].cuerpo.contents.at(-1).parts;
    expect(partes[1].inlineData).toEqual({ mimeType: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64') });
  });

  it('rechaza fotos de otra dirección, de otra cuenta o de otra conversación, sin descargarlas', async () => {
    silenciarErrores();
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    const espia = vi.fn(falso);
    vi.stubGlobal('fetch', espia);
    const convId = await crearConversacion(ana.uid);

    const urlsProhibidas = [
      'https://sitio-ajeno.ejemplo/foto.jpg',
      'http://169.254.169.254/computeMetadata/v1/',
      await subirFoto(`medical-images/${beto.uid}/${convId}/de-beto.jpg`),
      await subirFoto(`medical-images/${ana.uid}/otra-conversacion/foto.jpg`),
      await subirFoto(`medical-images/${ana.uid}/${convId}/no-es-imagen.html`, Buffer.from('<html>'), 'text/html'),
    ];
    for (const url of urlsProhibidas) {
      expect(await enviarMensajeConsulta(ana.idToken, convId, { texto: 'mira', imageUrls: [url] }, paciente)).toEqual({
        success: false,
        message: '',
        error: IMAGEN_NO_VALIDA,
      });
    }
    expect(espia.mock.calls.some(([u]) => String(u).includes('sitio-ajeno') || String(u).includes('169.254'))).toBe(false);
    expect(llamadasGemini).toHaveLength(0);
    expect(await mensajesGuardados(ana.uid, convId)).toHaveLength(0);
  });

  it('rechaza más de 4 fotos y mensajes de más de 10.000 caracteres', async () => {
    const convId = await crearConversacion(ana.uid);
    const url = await subirFoto(`medical-images/${ana.uid}/${convId}/a.jpg`);

    expect(await enviarMensajeConsulta(ana.idToken, convId, { texto: 'x', imageUrls: [url, url, url, url, url] }, paciente)).toMatchObject({ error: IMAGEN_NO_VALIDA });
    expect(await enviarMensajeConsulta(ana.idToken, convId, { texto: 'a'.repeat(10_001) }, paciente)).toMatchObject({ error: MENSAJE_MUY_LARGO });
    expect(await mensajesGuardados(ana.uid, convId)).toHaveLength(0);
  });

  it('corta en 20 mensajes por hora, con el aviso de urgencias', async () => {
    await getAdminDb().doc(`rate_limits/${ana.uid}`).set({ count: 20, windowStart: Date.now(), lastRequest: Date.now() });
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'hola' }, paciente);
    expect(resultado.success).toBe(false);
    expect((resultado as { error: string }).error).toContain('20 mensajes por hora');
    expect((resultado as { error: string }).error).toContain(AVISO_URGENCIAS);
    expect(llamadasGemini).toHaveLength(0);
  });

  it('si Gemini falla una vez por saturación, reintenta solo y responde', async () => {
    silenciarErrores();
    let intento = 0;
    const { falso, llamadasGemini } = fetchFalso(() => (++intento === 1 ? new Response('overloaded', { status: 503 }) : respuestaGemini('Ya estoy aquí.')));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    expect(await enviarMensajeConsulta(ana.idToken, convId, { texto: 'hola' }, paciente)).toEqual({ success: true, message: 'Ya estoy aquí.' });
    expect(llamadasGemini).toHaveLength(2);
  });

  it('si Gemini sigue fallando, devuelve el error con el aviso de urgencias y conserva la pregunta', async () => {
    silenciarErrores();
    const { falso, llamadasGemini } = fetchFalso(() => new Response('Service Unavailable', { status: 503 }));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'me duele el pecho' }, paciente);
    expect(resultado.success).toBe(false);
    expect((resultado as { error: string }).error).toContain(AVISO_URGENCIAS);
    expect(llamadasGemini).toHaveLength(2);
    expect((await mensajesGuardados(ana.uid, convId)).map((m) => m.role)).toEqual(['user']);
  });

  it('si Gemini bloquea el contenido no reintenta', async () => {
    silenciarErrores();
    const { falso, llamadasGemini } = fetchFalso(() => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'hola' }, paciente);
    expect((resultado as { error: string }).error).toContain('Reformula tu consulta');
    expect(llamadasGemini).toHaveLength(1);
  });
});

describe('Saludo inicial (saludarEnConsulta)', () => {
  it('saluda en una conversación vacía y guarda el saludo', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('¡Hola, Ana! Soy la Dra. Hilda.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await saludarEnConsulta(ana.idToken, convId, { nombre: 'Ana', primeraVez: true, periodo: 'Buenos días' }, paciente);
    expect(resultado).toEqual({ success: true, message: '¡Hola, Ana! Soy la Dra. Hilda.' });
    expect(llamadasGemini[0].cuerpo.contents[0].parts[0].text).toContain('Saluda al usuario llamado Ana por primera vez');
    expect((await mensajesGuardados(ana.uid, convId)).map((m) => m.role)).toEqual(['assistant']);
  });

  it('no vuelve a saludar si la conversación ya tiene mensajes', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Hola' });

    expect((await saludarEnConsulta(ana.idToken, convId, { primeraVez: false, periodo: 'Buenas tardes' }, paciente)).success).toBe(false);
    expect(llamadasGemini).toHaveLength(0);
  });
});
