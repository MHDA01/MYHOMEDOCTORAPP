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
// La teleorientación habla por el endpoint NATIVO de Gemini desde el
// 6-nov-2026 (por el caché del prompt de sistema y por los tokens de
// razonamiento), así que estas pruebas comprueban ese formato: `contents` con
// `parts`, y la instrucción de sistema en `systemInstruction`.
import { crearUsuario, fetchFalso, respuestaGeminiNativa, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

const BUCKET = 'demo-mhda.appspot.com';

const paciente: PatientStructuredContext = {
  firstName: 'Ana',
  lastName: 'Pérez',
  age: 34,
  sex: 'f',
  allergies: ['penicilina'],
  medications: ['levotiroxina'],
};

/**
 * La llamada de la conversación, no la del extractor.
 *
 * Desde que el extractor corre a la vez que la respuesta, hay dos peticiones a
 * Gemini por turno y el orden en que llegan no está garantizado. Se distinguen
 * por el molde: solo el extractor pide `responseSchema`.
 */
function llamadaDeHilda(llamadas: Array<{ cuerpo: any }>) {
  return llamadas.find((l) => !l.cuerpo?.generationConfig?.responseSchema)!;
}

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

describe('Enviar un mensaje a Hilda (enviarMensajeConsulta)', () => {
  it('sin sesión o en una conversación ajena no llama a la IA ni guarda nada', async () => {
    silenciarErrores();
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('no debería llegar'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    expect((await enviarMensajeConsulta('', convId, { texto: 'hola' }, paciente)).success).toBe(false);
    expect((await enviarMensajeConsulta(beto.idToken, convId, { texto: 'hola' }, paciente)).success).toBe(false);
    expect(llamadasGemini).toHaveLength(0);
    expect(await mensajesGuardados(ana.uid, convId)).toHaveLength(0);
  });

  it('el servidor guarda la pregunta y la respuesta, cifradas, y no reescribe la fecha de creación', async () => {
    const { falso } = fetchFalso(() => respuestaGeminiNativa('Te recomiendo hidratarte.'));
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

  it('le lleva a Hilda la ficha del integrante, leída del servidor y no del teléfono', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('Entendido.'));
    vi.stubGlobal('fetch', falso);

    // Un integrante con antecedentes guardados, y una conversación que dice de
    // quién es. Nada de esto viaja desde el navegador: `paciente` sigue siendo
    // el contexto aplanado de siempre, que no trae nada de esto.
    const integranteRef = getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/Integrantes/m1`);
    await integranteRef.set({
      firstName: 'Ana',
      lastName: 'Pérez',
      sex: 'female',
      dateOfBirth: '1992-03-14',
      allergies: ['penicilina'],
      medications: ['levotiroxina'],
    });
    await integranteRef.collection('historial').doc('registro').set({
      pathologicalHistory: 'hipertensión hace 5 años',
    });
    const convId = 'con-ficha';
    await getAdminDb()
      .doc(`Cuentas_Tutor/${ana.uid}/conversaciones/${convId}`)
      .set({ status: 'active', createdAt: new Date('2026-09-01T10:00:00Z'), memberId: 'm1' });

    await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Me duele la cabeza' }, paciente);

    const contexto = llamadaDeHilda(llamadasGemini).cuerpo.contents[0].parts[0].text as string;
    expect(contexto).toContain('FICHA DE LA PERSONA');
    expect(contexto).toContain('penicilina');
    // El texto libre del perfil viejo llega marcado, no como antecedente tipado.
    expect(contexto).toContain('"hipertensión hace 5 años"');
    expect(contexto).toContain('sin estructurar');
  });

  it('guarda en la ficha lo que la persona contó, y lo encuentra en la siguiente consulta', async () => {
    // Las dos llamadas van a la vez; se distinguen por el molde.
    const { falso } = fetchFalso((_url, init) => {
      const cuerpo = JSON.parse(String(init?.body ?? '{}'));
      if (cuerpo?.generationConfig?.responseSchema) {
        return respuestaGeminiNativa(
          JSON.stringify({
            hallazgos: [
              {
                id: 'tabaquismo',
                estado: 'negado',
                frase: 'nunca he fumado',
                temporalidad: 'antecedente',
              },
            ],
          })
        );
      }
      return respuestaGeminiNativa('Entendido, gracias.');
    });
    vi.stubGlobal('fetch', falso);

    const integranteRef = getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/Integrantes/m2`);
    await integranteRef.set({ firstName: 'Ana', lastName: 'Pérez', sex: 'female', dateOfBirth: '1992-03-14' });
    const convId = 'aprende';
    await getAdminDb()
      .doc(`Cuentas_Tutor/${ana.uid}/conversaciones/${convId}`)
      .set({ status: 'active', createdAt: new Date('2026-09-01T10:00:00Z'), memberId: 'm2' });

    await enviarMensajeConsulta(ana.idToken, convId, { texto: 'nunca he fumado' }, paciente);

    // Quedó guardado fuera de Cuentas_Tutor, donde el navegador no escribe.
    const guardada = await getAdminDb().doc(`fichas_clinicas/${ana.uid}/integrantes/m2`).get();
    expect(guardada.exists).toBe(true);
    expect(guardada.get('campos').tabaquismo.referido).toMatchObject({
      estado: 'negado',
      informante: 'paciente',
    });

    // Y en la consulta siguiente le llega a Hilda sin volver a preguntarlo.
    const conv2 = 'aprende-2';
    await getAdminDb()
      .doc(`Cuentas_Tutor/${ana.uid}/conversaciones/${conv2}`)
      .set({ status: 'active', createdAt: new Date('2026-09-02T10:00:00Z'), memberId: 'm2' });

    const { falso: falso2, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('Hola.'));
    vi.stubGlobal('fetch', falso2);
    await enviarMensajeConsulta(ana.idToken, conv2, { texto: 'Hola' }, paciente);

    const contexto = llamadaDeHilda(llamadasGemini).cuerpo.contents[0].parts[0].text as string;
    expect(contexto).toContain('Tabaquismo: no');
  });

  it('sin ficha legible, la consulta sigue igual que antes', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('Entendido.'));
    vi.stubGlobal('fetch', falso);
    // Conversación sin `memberId`: no se sabe de quién es la ficha. Un fallo
    // leyéndola no puede dejar sin orientación a quien está preguntando.
    const convId = await crearConversacion(ana.uid, 'sin-ficha');

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Hola' }, paciente);

    expect(resultado.success).toBe(true);
    const contexto = llamadasGemini[0].cuerpo.contents[0].parts[0].text as string;
    expect(contexto).toContain('Contexto del paciente actual');
    expect(contexto).not.toContain('FICHA DE LA PERSONA');
  });

  it('arma el historial desde la base de datos, sin los textos de sistema, con el contexto del paciente', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('Desde ayer entonces.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Hola, soy Hilda' });
    await persistSecureMessage(ana.idToken, convId, { role: 'user', content: 'Tengo fiebre' });
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Error del servicio de IA 503', sistema: true });

    await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Desde ayer' }, paciente);

    const { cuerpo } = llamadasGemini[0];
    // La instrucción de sistema va en su propio campo; el contexto del paciente
    // abre `contents` y detrás va el historial, con el rol `model` de Gemini sin
    // traducir.
    const textos = cuerpo.contents.map((c: any) => [c.role, c.parts.map((p: any) => p.text).join('')]);
    expect(textos.slice(1)).toEqual([
      ['model', 'Hola, soy Hilda'],
      ['user', 'Tengo fiebre'],
      ['user', 'Desde ayer'],
    ]);

    // El contexto del paciente es el primer turno, no parte del prompt.
    const [rolContexto, contexto] = textos[0];
    expect(rolContexto).toBe('user');
    expect(contexto).toContain('Nombre: Ana Pérez');
    expect(contexto).toContain('Alergias: penicilina');

    const sistema = cuerpo.systemInstruction.parts[0].text as string;
    expect(sistema).toContain('Eres Hilda');
    // Hilda es un personaje creado con IA, no una médica: el prompt no debe
    // volver a presentarla con título. Si alguien lo reintroduce, esto falla.
    expect(sistema).not.toMatch(/Dra\.?\s*Hilda|doctora Hilda/i);
    // La Res. 2654 de 2019 está derogada por la 1644 de 2026. Hilda le explica
    // el marco legal a cada paciente nuevo, así que citar la vieja es decirle
    // algo falso con autoridad. Si alguien la reintroduce, esto falla.
    expect(sistema).not.toContain('2654');
    expect(sistema).toContain('Resolución 1644 de 2026');
    // Una sola pregunta por mensaje: con varias juntas, quien escucha en voz
    // alta solo retiene la última y la anamnesis queda coja.
    expect(sistema).toMatch(/una\s+sola pregunta/i);

    // Y lo que hace que el caché del prompt sirva para algo: en la instrucción
    // de sistema NO puede quedar nada del paciente. Si vuelve a colarse, habría
    // un caché distinto por persona —se pagaría el almacenamiento de todos y no
    // se ahorraría en ninguno—. Ver `contextoDelPaciente`.
    expect(sistema).not.toContain('Ana Pérez');
    expect(sistema).not.toContain('penicilina');
    expect(sistema).not.toContain('Contexto del paciente');
  });

  it('manda a la IA las fotos de la carpeta de la conversación como imagen', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('Veo la lesión.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);
    const url = await subirFoto(`medical-images/${ana.uid}/${convId}/lunar.jpg`);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: '', imageUrls: [url] }, paciente);
    expect(resultado.success).toBe(true);

    const partes = llamadasGemini[0].cuerpo.contents.at(-1).parts;
    const base64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0]).toString('base64');
    // En el formato nativo la foto viaja como `inlineData`, sin `data:` URI.
    expect(partes[1]).toEqual({ inlineData: { mimeType: 'image/jpeg', data: base64 } });
  });

  it('rechaza fotos de otra dirección, de otra cuenta o de otra conversación, sin descargarlas', async () => {
    silenciarErrores();
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('no debería llegar'));
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
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('no debería llegar'));
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
    const { falso, llamadasGemini } = fetchFalso(() => (++intento === 1 ? new Response('overloaded', { status: 503 }) : respuestaGeminiNativa('Ya estoy aquí.')));
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
    // En el formato nativo el bloqueo de entrada llega en `promptFeedback`,
    // no como motivo de terminación de la respuesta.
    const { falso, llamadasGemini } = fetchFalso(
      () => new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }))
    );
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'hola' }, paciente);
    expect((resultado as { error: string }).error).toContain('Reformula tu consulta');
    expect(llamadasGemini).toHaveLength(1);
  });
});

describe('Saludo inicial (saludarEnConsulta)', () => {
  it('saluda en una conversación vacía y guarda el saludo', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('¡Hola, Ana! Soy Hilda.'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await saludarEnConsulta(ana.idToken, convId, { nombre: 'Ana', primeraVez: true, periodo: 'Buenos días' }, paciente);
    expect(resultado).toEqual({ success: true, message: '¡Hola, Ana! Soy Hilda.' });
    // `contents[0]` es el contexto del paciente; la instrucción del saludo va
    // detrás. Ver `contextoDelPaciente`.
    expect(llamadasGemini[0].cuerpo.contents[0].parts[0].text).toContain('Nombre: Ana');
    expect(llamadasGemini[0].cuerpo.contents[1].parts[0].text).toContain(
      'Saluda al usuario llamado Ana por primera vez'
    );
    expect((await mensajesGuardados(ana.uid, convId)).map((m) => m.role)).toEqual(['assistant']);
  });

  it('no vuelve a saludar si la conversación ya tiene mensajes', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGeminiNativa('no debería llegar'));
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);
    await persistSecureMessage(ana.idToken, convId, { role: 'assistant', content: 'Hola' });

    expect((await saludarEnConsulta(ana.idToken, convId, { primeraVez: false, periodo: 'Buenas tardes' }, paciente)).success).toBe(false);
    expect(llamadasGemini).toHaveLength(0);
  });
});
