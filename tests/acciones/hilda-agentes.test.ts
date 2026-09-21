import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '@/lib/firebase-admin';
import { enviarMensajeConsulta, type PatientStructuredContext } from '@/app/actions/teleorientacion';
import { olvidarProtocolosEnCache } from '@/lib/hilda/protocolos-activos';
import { RESPUESTA_DE_RESPALDO } from '@/lib/hilda/textos-agentes';
import { AVISO_URGENCIAS } from '@/lib/textos-chat';
import {
  crearUsuario,
  fetchPorAgente,
  llamadasDelRedactor,
  respuestaGemini,
  respuestaLector,
  vaciarFirestore,
  type UsuarioDePrueba,
} from '../ayudas';

const paciente: PatientStructuredContext = { firstName: 'Ana', lastName: 'Pérez', age: 31, sex: 'f' };
const MOTIVO = 'diarrea-primera-infancia';

async function publicarProtocolo(enUso = true) {
  const db = getAdminDb();
  await db.doc('protocolos_fuentes/gpc-eda-2013').set({ titulo: 'GPC EDA', entidad: 'Ministerio de Salud y Protección Social - Colciencias', anio: 2013 });
  await db.doc(`protocolos_publicados/${MOTIVO}`).set({
    motivo_id: MOTIVO,
    motivo: { id: MOTIVO, motivo: 'Diarrea', curso_de_vida: 'primera_infancia', edad: 'menores de 5 años' },
    version: 2,
    en_uso_por_hilda: enUso,
    items: [
      { id: 'i1', seccion: 'preguntas_triage', texto: '¿Cuántas deposiciones ha tenido en las últimas 24 horas?', fuente: 'gpc-eda-2013' },
      { id: 'i2', seccion: 'signos_de_alarma', texto: 'sangre en las heces', fuente: 'gpc-eda-2013' },
      { id: 'i3', seccion: 'medidas_en_casa', texto: 'Continúe la lactancia materna.', fuente: 'gpc-eda-2013' },
    ],
  });
}

async function crearConversacion(uid: string, id = 'c1') {
  await getAdminDb().doc(`Cuentas_Tutor/${uid}/conversaciones/${id}`).set({ status: 'active' });
  return id;
}

async function trazas(uid: string, convId: string) {
  const snap = await getAdminDb().collection(`Cuentas_Tutor/${uid}/conversaciones/${convId}/trazas`).orderBy('creado').get();
  return snap.docs.map((d) => d.data());
}

async function estado(uid: string, convId: string) {
  return (await getAdminDb().doc(`Cuentas_Tutor/${uid}/conversaciones/${convId}/agente/estado`).get()).data();
}

let ana: UsuarioDePrueba;

beforeEach(async () => {
  await vaciarFirestore();
  olvidarProtocolosEnCache();
  ana = await crearUsuario();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.HILDA_AGENTES;
});

describe('Centinela: signo de alarma', () => {
  it('deriva con un texto fijo, sin que la IA redactora participe, y deja traza cifrada', async () => {
    await publicarProtocolo();
    const { falso, llamadasGemini } = fetchPorAgente({
      lector: () =>
        respuestaLector({
          motivo_id: MOTIVO,
          edad_anios: 2,
          signos: [{ id: `${MOTIVO}:i2`, estado: 'presente', evidencia: 'hizo popó con sangre' }],
        }),
      redactor: () => respuestaGemini('no debería llegar'),
    });
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Mi hijo de 2 años hizo popó con sangre' }, paciente);
    expect(resultado.success).toBe(true);
    expect(resultado.message).toContain('sangre en las heces');
    expect(resultado.message).toContain(AVISO_URGENCIAS);
    expect(llamadasDelRedactor(llamadasGemini)).toHaveLength(0);

    const [traza] = await trazas(ana.uid, convId);
    expect(traza).toMatchObject({
      fase: 'derivacion_urgente',
      respuesta: 'urgencia',
      motivo_id: MOTIVO,
      protocolo_version: 2,
      signos_disparados: [`${MOTIVO}:i2`],
    });
    expect(String(traza.detalle)).not.toContain('sangre');
    expect((await estado(ana.uid, convId))?.alarma_activada).toBe(true);
  });
});

describe('Entrevistador guiado por protocolo', () => {
  it('con protocolo activo, primero pregunta lo que falta y la IA recibe solo frases aprobadas', async () => {
    await publicarProtocolo();
    const { falso, llamadasGemini } = fetchPorAgente({
      lector: () => respuestaLector({ motivo_id: MOTIVO, edad_anios: 2 }),
      redactor: () => respuestaGemini('Entiendo. ¿Cuántas deposiciones ha tenido en las últimas 24 horas?'),
    });
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Mi hijo de 2 años tiene diarrea' }, paciente);
    expect(resultado.success).toBe(true);

    const sistema = llamadasDelRedactor(llamadasGemini)[0].cuerpo.systemInstruction.parts[0].text as string;
    expect(sistema).toContain('PROTOCOLO APROBADO — Diarrea');
    expect(sistema).toContain('Continúe la lactancia materna.');
    expect(sistema).toContain('[Fuente: Ministerio de Salud y Protección Social 2013]');
    expect(sistema).toContain('TU TAREA EN ESTE TURNO: entrevista');
    expect(sistema).toContain('Aclarar si hay: sangre en las heces');

    expect(await estado(ana.uid, convId)).toMatchObject({ motivo_id: MOTIVO, turnos_entrevista: 1, alarma_activada: false });
  });

  it('un protocolo publicado pero no activado no llega a la Dra. Hilda', async () => {
    await publicarProtocolo(false);
    const { falso, llamadasGemini } = fetchPorAgente({
      lector: () => respuestaLector({ motivo_id: MOTIVO }),
      redactor: () => respuestaGemini('Cuéntame más, por favor.'),
    });
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    await enviarMensajeConsulta(ana.idToken, convId, { texto: 'Mi hijo tiene diarrea' }, paciente);
    const sistema = llamadasDelRedactor(llamadasGemini)[0].cuerpo.systemInstruction.parts[0].text as string;
    expect(sistema).not.toContain('PROTOCOLO APROBADO');
  });
});

describe('Verificador de salida', () => {
  it('una respuesta con dosis no sale: se corrige y se envía la corregida', async () => {
    const { falso, llamadasGemini } = fetchPorAgente({
      redactor: (n) => respuestaGemini(n === 1 ? 'Dale 5 ml de jarabe cada 8 horas.' : 'Para la tos, lo indicado es que lo valore un médico.'),
    });
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'mi hija tiene tos, ¿qué le doy?' }, paciente);
    expect(resultado).toEqual({ success: true, message: 'Para la tos, lo indicado es que lo valore un médico.' });

    const redactor = llamadasDelRedactor(llamadasGemini);
    expect(redactor).toHaveLength(2);
    expect(redactor[1].cuerpo.systemInstruction.parts[0].text).toContain('Tu respuesta anterior no se envió');
    const [traza] = await trazas(ana.uid, convId);
    expect(traza.respuesta).toBe('ia');
    expect(traza.redactor.fallas).toContain('dosis');
  });

  it('si la IA insiste, sale el texto de respaldo', async () => {
    const { falso } = fetchPorAgente({ redactor: () => respuestaGemini('Tómate un ibuprofeno de 400 mg.') });
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    const resultado = await enviarMensajeConsulta(ana.idToken, convId, { texto: 'me duele la cabeza' }, paciente);
    expect(resultado).toEqual({ success: true, message: RESPUESTA_DE_RESPALDO });
    const [traza] = await trazas(ana.uid, convId);
    expect(traza.respuesta).toBe('respaldo');
  });
});

describe('Interruptor de emergencia', () => {
  it('HILDA_AGENTES=apagado vuelve al chat de una sola llamada', async () => {
    process.env.HILDA_AGENTES = 'apagado';
    const { falso, llamadasGemini } = fetchPorAgente({ redactor: () => respuestaGemini('Hola, ¿en qué te ayudo?') });
    vi.stubGlobal('fetch', falso);
    const convId = await crearConversacion(ana.uid);

    expect(await enviarMensajeConsulta(ana.idToken, convId, { texto: 'hola' }, paciente)).toEqual({ success: true, message: 'Hola, ¿en qué te ayudo?' });
    expect(llamadasGemini).toHaveLength(1);
    expect(await trazas(ana.uid, convId)).toHaveLength(0);
  });
});

describe('Activar un protocolo en la Dra. Hilda (panel)', () => {
  it('solo el administrador lo activa o retira, y la Dra. Hilda lo toma', async () => {
    const { activarEnHildaAdmin } = await import('@/app/actions/admin-protocolos');
    process.env.ADMIN_EMAILS = 'medico@ejemplo.test';
    const medico = await crearUsuario('medico@ejemplo.test');
    await publicarProtocolo(false);

    expect(await activarEnHildaAdmin(ana.idToken, MOTIVO, true)).toMatchObject({ success: false });
    expect(await activarEnHildaAdmin(medico.idToken, 'no-existe', true)).toMatchObject({ success: false });
    expect(await activarEnHildaAdmin(medico.idToken, MOTIVO, true)).toEqual({ success: true, data: null });

    const doc = (await getAdminDb().doc(`protocolos_publicados/${MOTIVO}`).get()).data()!;
    expect(doc.en_uso_por_hilda).toBe(true);
    expect(doc.activado_por).toBe('medico@ejemplo.test');

    olvidarProtocolosEnCache();
    const { protocolosActivos } = await import('@/lib/hilda/protocolos-activos');
    expect((await protocolosActivos()).map((p) => p.motivoId)).toEqual([MOTIVO]);

    expect(await activarEnHildaAdmin(medico.idToken, MOTIVO, false)).toEqual({ success: true, data: null });
    olvidarProtocolosEnCache();
    expect(await protocolosActivos()).toEqual([]);
    delete process.env.ADMIN_EMAILS;
  });
});
