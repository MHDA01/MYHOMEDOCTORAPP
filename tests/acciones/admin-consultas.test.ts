import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  abrirConsultaAdmin,
  listarConsultasAdmin,
  marcarConsultaRevisada,
  obtenerTranscripcionAdmin,
} from '@/app/actions/admin-consultas';
import { persistSecureMessage } from '@/app/actions/teleorientacion';
import { getAdminDb } from '@/lib/firebase-admin';
import { decryptField, encryptField } from '@/lib/crypto';
import { COLECCION_AUDITORIA } from '@/lib/constants';
import { crearUsuario, fetchFalso, respuestaGemini, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

const RESUMEN_LEVE = {
  motivo: 'Tos y fiebre de 3 días',
  evolucion: '3 días',
  relato: 'Tos seca y fiebre de 38 desde hace tres días, sin dificultad respiratoria.',
  sintomas: { presentes: ['tos', 'fiebre'], negados: ['vómito'] },
  banderas: [],
  antecedentesRelevantes: ['Alergias: penicilina'],
  nivel: 'casa',
  porQue: 'Cuadro respiratorio leve sin señales de alarma.',
  orientoHilda: 'Le recomendó hidratarse y vigilar la fiebre.',
  sinPreguntar: ['Frecuencia respiratoria'],
  discrepancia: '',
  confianza: 'alta',
};

const RESUMEN_CON_ALARMA = {
  ...RESUMEN_LEVE,
  // El modelo se equivoca a propósito: propone casa con una bandera crítica.
  nivel: 'casa',
  banderas: [{ senal: 'Dificultad para respirar', evidencia: 'no puedo respirar bien', severidad: 'critica' }],
};

let medico: UsuarioDePrueba;
let ana: UsuarioDePrueba;

/** Responde a Gemini con ese resumen y cuenta cuántas veces se le preguntó. */
function gemini(resumen: unknown) {
  const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini(JSON.stringify(resumen)));
  vi.stubGlobal('fetch', falso);
  return llamadasGemini;
}

function silenciarErrores() {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
}

async function crearCuentaConConsulta(
  usuario: UsuarioDePrueba,
  convId: string,
  mensajes: Array<{ role: 'user' | 'assistant'; content: string; sistema?: boolean }>
) {
  const db = getAdminDb();
  await db.doc(`Cuentas_Tutor/${usuario.uid}`).set({
    personalInfo: { firstName: 'Ana', lastName: 'Pérez', sex: 'f', dateOfBirth: '1992-04-10' },
    isEncrypted: true,
    healthInfo: {
      isEncrypted: true,
      encryptedAllergies: encryptField(JSON.stringify(['penicilina'])),
      encryptedMedications: encryptField(JSON.stringify([])),
      encrypted_pathologicalHistory: encryptField('Asma en la infancia'),
    },
  });
  await db.doc(`Cuentas_Tutor/${usuario.uid}/conversaciones/${convId}`).set({
    memberId: 'titular',
    memberName: 'Ana Pérez',
    title: 'Consulta para Ana',
    createdAt: new Date('2026-10-18T10:00:00Z'),
  });
  for (const m of mensajes) {
    await persistSecureMessage(usuario.idToken, convId, m);
  }
}

async function resumenGuardado(uid: string, convId: string) {
  return (await getAdminDb().doc(`Cuentas_Tutor/${uid}/conversaciones/${convId}/resumen/medico`).get()).data();
}

async function auditoria() {
  return (await getAdminDb().collection(COLECCION_AUDITORIA).get()).docs.map((d) => d.data());
}

beforeEach(async () => {
  await vaciarFirestore();
  medico = await crearUsuario();
  ana = await crearUsuario();
  process.env.ADMIN_EMAILS = medico.email;
});

afterEach(() => {
  delete process.env.ADMIN_EMAILS;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Solo el médico entra', () => {
  it('quien no es administrador no lee la bandeja, ni el resumen, ni el chat, ni revisa', async () => {
    silenciarErrores();
    const llamadas = gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);
    const noAutorizado = { success: false, error: 'No autorizado para usar esta herramienta.' };

    expect(await listarConsultasAdmin(ana.idToken)).toEqual(noAutorizado);
    expect(await abrirConsultaAdmin(ana.idToken, ana.uid, 'c1')).toEqual(noAutorizado);
    expect(await obtenerTranscripcionAdmin(ana.idToken, ana.uid, 'c1')).toEqual(noAutorizado);
    expect(await marcarConsultaRevisada(ana.idToken, ana.uid, 'c1', 'nada')).toEqual(noAutorizado);

    expect(llamadas).toHaveLength(0);
    expect(await resumenGuardado(ana.uid, 'c1')).toBeUndefined();
    expect(await auditoria()).toHaveLength(0);
  });

  it('sin ADMIN_EMAILS configurado no entra nadie', async () => {
    delete process.env.ADMIN_EMAILS;
    expect(await listarConsultasAdmin(medico.idToken)).toEqual({
      success: false,
      error: 'Panel no configurado (falta ADMIN_EMAILS).',
    });
  });
});

describe('La bandeja', () => {
  it('trae las consultas con mensajes y deja fuera las vacías', async () => {
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);
    await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/conversaciones/vacia`).set({ memberName: 'Ana Pérez', messageCount: 0 });

    const r = await listarConsultasAdmin(medico.idToken);
    if (!r.success) throw new Error(r.error);

    expect(r.data).toHaveLength(1);
    expect(r.data[0]).toMatchObject({
      uid: ana.uid,
      convId: 'c1',
      paciente: 'Ana Pérez',
      mensajes: 1,
      nivel: null,
      banderas: 0,
      revisadaEn: null,
    });
  });

  it('no muestra el contenido de la consulta', async () => {
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo un secreto médico' }]);

    const r = await listarConsultasAdmin(medico.idToken);
    if (!r.success) throw new Error(r.error);
    expect(JSON.stringify(r.data)).not.toContain('secreto');
  });

  it('pone las urgentes primero y las ya clasificadas como leves al final', async () => {
    const beto = await crearUsuario();
    await crearCuentaConConsulta(ana, 'grave', [{ role: 'user', content: 'No puedo respirar' }]);
    await crearCuentaConConsulta(beto, 'leve', [{ role: 'user', content: 'Tengo tos' }]);
    const sinLeer = await crearUsuario();
    await crearCuentaConConsulta(sinLeer, 'nueva', [{ role: 'user', content: 'Hola' }]);

    gemini(RESUMEN_CON_ALARMA);
    await abrirConsultaAdmin(medico.idToken, ana.uid, 'grave');
    vi.unstubAllGlobals();
    gemini(RESUMEN_LEVE);
    await abrirConsultaAdmin(medico.idToken, beto.uid, 'leve');

    const r = await listarConsultasAdmin(medico.idToken);
    if (!r.success) throw new Error(r.error);
    expect(r.data.map((c) => c.convId)).toEqual(['grave', 'nueva', 'leve']);
    expect(r.data[0]).toMatchObject({ nivel: 'urgencias', banderas: 1 });
  });
});

describe('Abrir una consulta', () => {
  it('resume el chat descifrado con la ficha del paciente y guarda el resumen cifrado', async () => {
    const llamadas = gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [
      { role: 'assistant', content: '¿En qué te ayudo?' },
      { role: 'user', content: 'Tengo tos y fiebre hace 3 días' },
      { role: 'assistant', content: 'Error del servicio de IA', sistema: true },
    ]);

    const r = await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    if (!r.success) throw new Error(r.error);

    expect(r.data.resumen.motivo).toBe('Tos y fiebre de 3 días');
    expect(r.data.paciente).toMatchObject({ nombre: 'Ana Pérez', sexo: 'femenino', alergias: ['penicilina'] });
    expect(r.data.paciente.antecedentes).toContain('Patológicos: Asma en la infancia');

    // Lo que viajó al modelo: la ficha en claro y el chat sin los textos de sistema.
    const texto = llamadas[0].cuerpo.contents[0].parts[0].text as string;
    expect(texto).toContain('penicilina');
    expect(texto).toContain('PACIENTE: Tengo tos y fiebre hace 3 días');
    expect(texto).not.toContain('Error del servicio de IA');

    // Y lo que quedó escrito: el resumen cifrado, la cabecera en claro.
    const guardado = await resumenGuardado(ana.uid, 'c1');
    expect(guardado?.nivel).toBe('casa');
    expect(guardado?.banderas).toBe(0);
    expect(String(guardado?.datos)).not.toContain('fiebre');
    expect(JSON.parse(decryptField(String(guardado?.datos))).motivo).toBe('Tos y fiebre de 3 días');
  });

  it('una señal crítica manda a urgencias aunque el modelo haya dicho casa', async () => {
    gemini(RESUMEN_CON_ALARMA);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'no puedo respirar bien' }]);

    const r = await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    if (!r.success) throw new Error(r.error);

    expect(r.data.resumen.nivel).toBe('urgencias');
    expect((await resumenGuardado(ana.uid, 'c1'))?.nivel).toBe('urgencias');
  });

  it('la segunda vez lee el resumen guardado y no vuelve a pagar el modelo', async () => {
    const llamadas = gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);

    await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    const segunda = await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    if (!segunda.success) throw new Error(segunda.error);

    expect(llamadas).toHaveLength(1);
    expect(segunda.data.resumen.motivo).toBe('Tos y fiebre de 3 días');
  });

  it('rehacer el resumen sí vuelve a preguntar', async () => {
    const llamadas = gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);

    await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1', true);

    expect(llamadas).toHaveLength(2);
    expect((await auditoria()).map((a) => a.accion)).toContain('resumen_regenerado');
  });

  it('si el modelo devuelve algo que no cumple el esquema, no guarda nada', async () => {
    silenciarErrores();
    gemini({ motivo: 'Tos', nivel: 'hospitalizar' });
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);

    const r = await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    expect(r.success).toBe(false);
    expect(await resumenGuardado(ana.uid, 'c1')).toBeUndefined();
  });

  it('una consulta donde el paciente no escribió no se resume', async () => {
    const llamadas = gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'assistant', content: 'Hola, soy la Dra. Hilda' }]);

    expect(await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1')).toEqual({
      success: false,
      error: 'En esta consulta el paciente no alcanzó a escribir nada.',
    });
    expect(llamadas).toHaveLength(0);
  });

  it('una consulta que ya no existe no rompe el panel', async () => {
    expect(await abrirConsultaAdmin(medico.idToken, ana.uid, 'no-existe')).toEqual({
      success: false,
      error: 'Esa consulta ya no existe.',
    });
  });
});

describe('Transcripción y revisión', () => {
  it('la conversación llega descifrada, sin los textos de sistema', async () => {
    await crearCuentaConConsulta(ana, 'c1', [
      { role: 'user', content: 'Tengo tos' },
      { role: 'assistant', content: '¿Desde cuándo?' },
      { role: 'assistant', content: 'Error del servicio de IA', sistema: true },
    ]);

    const r = await obtenerTranscripcionAdmin(medico.idToken, ana.uid, 'c1');
    if (!r.success) throw new Error(r.error);

    expect(r.data.map((m) => [m.quien, m.texto])).toEqual([
      ['paciente', 'Tengo tos'],
      ['hilda', '¿Desde cuándo?'],
    ]);
    expect((await auditoria()).map((a) => a.accion)).toEqual(['transcripcion']);
  });

  it('la nota del médico se guarda cifrada y la consulta queda marcada', async () => {
    gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);
    await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');

    const r = await marcarConsultaRevisada(medico.idToken, ana.uid, 'c1', 'Cité a control en 48 horas.');
    expect(r.success).toBe(true);

    const guardado = await resumenGuardado(ana.uid, 'c1');
    expect(guardado?.revisadaPor).toBe(medico.email);
    expect(String(guardado?.nota)).not.toContain('control');
    expect(decryptField(String(guardado?.nota))).toBe('Cité a control en 48 horas.');

    const cola = await listarConsultasAdmin(medico.idToken);
    if (!cola.success) throw new Error(cola.error);
    expect(cola.data[0].revisadaEn).not.toBeNull();
  });

  it('no se puede marcar como revisada una consulta que nadie ha abierto', async () => {
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);
    expect(await marcarConsultaRevisada(medico.idToken, ana.uid, 'c1', 'ya')).toEqual({
      success: false,
      error: 'Abre primero la consulta: no hay resumen que revisar.',
    });
  });
});

describe('Queda registrado quién miró', () => {
  it('cada apertura deja su rastro con el correo del médico y la consulta', async () => {
    gemini(RESUMEN_LEVE);
    await crearCuentaConConsulta(ana, 'c1', [{ role: 'user', content: 'Tengo tos' }]);

    await abrirConsultaAdmin(medico.idToken, ana.uid, 'c1');
    await obtenerTranscripcionAdmin(medico.idToken, ana.uid, 'c1');
    await marcarConsultaRevisada(medico.idToken, ana.uid, 'c1', '');

    const registros = await auditoria();
    expect(registros.map((a) => a.accion).sort()).toEqual(['resumen', 'revision', 'transcripcion']);
    expect(registros.every((a) => a.medico === medico.email && a.uid === ana.uid && a.convId === 'c1')).toBe(true);
    // El registro de accesos no es una segunda copia de la consulta.
    expect(JSON.stringify(registros)).not.toContain('tos');
  });
});
