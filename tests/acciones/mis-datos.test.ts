import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_AUDITORIA, COLECCION_MODALIDAD } from '@/lib/constants';
import { encryptField } from '@/lib/crypto';
import { saveFamilyMember } from '@/app/actions/family';
import { updateSecureHealthInfo } from '@/app/actions/user';
import { descargarMisDatos, eliminarMiCuenta } from '@/app/actions/mis-datos';
import { crearUsuario, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

const hija = {
  firstName: 'Sofía',
  lastName: 'Pérez',
  sex: 'female',
  dateOfBirth: '2019-03-10',
  relationship: 'Hijo/a',
  esTitular: false,
  allergies: ['amoxicilina'],
  medications: ['salbutamol'],
  pathologicalHistory: 'Asma leve',
};

let ana: UsuarioDePrueba;
let beto: UsuarioDePrueba;

/** Deja una cuenta con titular, una hija y una conversación con Hilda cifrada. */
async function sembrarCuenta(usuario: UsuarioDePrueba) {
  const db = getAdminDb();
  await db.doc(`Cuentas_Tutor/${usuario.uid}`).set({
    personalInfo: {
      firstName: 'Ana',
      lastName: 'Pérez',
      sex: 'female',
      dateOfBirth: new Date('1991-07-02T12:00:00.000Z'),
      country: 'colombia',
    },
    healthInfo: {},
  });
  await updateSecureHealthInfo(usuario.idToken, {
    allergies: ['ibuprofeno'],
    pathologicalHistory: 'Hipotiroidismo',
  });
  const { id } = (await saveFamilyMember(usuario.idToken, null, hija)) as { id: string };

  await db.doc(`Cuentas_Tutor/${usuario.uid}/conversaciones/c1`).set({ memberId: id, memberName: 'Sofía' });
  await db.doc(`Cuentas_Tutor/${usuario.uid}/conversaciones/c1/mensajes/m1`).set({
    role: 'user',
    content: encryptField('Mi hija tiene fiebre desde anoche'),
    isEncrypted: true,
    timestamp: new Date('2026-10-20T03:00:00.000Z'),
  });
  await db.doc(`Cuentas_Tutor/${usuario.uid}/reports/r1`).set({ titulo: 'Informe de orientación' });
  await db.doc(`${COLECCION_MODALIDAD}/${usuario.uid}`).set({ modalidad: 'gratis_ilimitado' });
  await db.doc(`rate_limits/${usuario.uid}`).set({ count: 3, windowStart: Date.now() });

  return id;
}

beforeEach(async () => {
  await vaciarFirestore();
  ana = await crearUsuario();
  beto = await crearUsuario();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Descargar mis datos (Ley 1581, derecho de acceso)', () => {
  it('entrega la cuenta completa con los campos cifrados ya en claro', async () => {
    const idHija = await sembrarCuenta(ana);

    const resultado = await descargarMisDatos(ana.idToken);
    if (!resultado.success) throw new Error(resultado.error);
    const copia = resultado.data;

    expect(copia.cuenta).toMatchObject({ id: ana.uid, correo: ana.email });
    expect(copia.incompleta).toBe(false);
    expect(typeof copia.generadaEn).toBe('string');

    // El titular: datos personales y salud descifrada, sin rastro del campo cifrado.
    const titular = copia.titular as any;
    expect(titular.personalInfo.firstName).toBe('Ana');
    expect(titular.personalInfo.dateOfBirth).toBe('1991-07-02T12:00:00.000Z');
    expect(titular.healthInfo.allergies).toEqual(['ibuprofeno']);
    expect(titular.healthInfo.pathologicalHistory).toBe('Hipotiroidismo');
    expect(titular.healthInfo.encryptedAllergies).toBeUndefined();
    expect(titular.healthInfo.isEncrypted).toBeUndefined();

    // La familia, con su historial colgando como subcolección.
    const integrantes = copia.subcolecciones.Integrantes as any[];
    expect(integrantes).toHaveLength(1);
    expect(integrantes[0]).toMatchObject({ id: idHija, firstName: 'Sofía', allergies: ['amoxicilina'] });
    expect(integrantes[0].subcolecciones.historial[0].pathologicalHistory).toBe('Asma leve');

    // La conversación con Hilda, palabra por palabra.
    const conversaciones = copia.subcolecciones.conversaciones as any[];
    expect(conversaciones[0].subcolecciones.mensajes[0]).toMatchObject({
      role: 'user',
      content: 'Mi hija tiene fiebre desde anoche',
      timestamp: '2026-10-20T03:00:00.000Z',
    });

    expect((copia.subcolecciones.reports as any[])[0].titulo).toBe('Informe de orientación');
  });

  it('una cuenta vacía recibe una copia vacía, no un error', async () => {
    const resultado = await descargarMisDatos(beto.idToken);
    if (!resultado.success) throw new Error(resultado.error);
    expect(resultado.data.titular).toEqual({});
    expect(resultado.data.subcolecciones).toEqual({});
  });

  it('cada quien recibe lo suyo, y una sesión inventada no recibe nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await sembrarCuenta(ana);

    const deBeto = await descargarMisDatos(beto.idToken);
    if (!deBeto.success) throw new Error(deBeto.error);
    expect(deBeto.data.subcolecciones).toEqual({});

    expect((await descargarMisDatos('token-inventado')).success).toBe(false);
    expect((await descargarMisDatos('')).success).toBe(false);
  });

  it('la copia no nombra las colecciones viejas: es un archivo que la persona abre', async () => {
    await sembrarCuenta(ana);
    await getAdminDb().collection('app_triage_sessions').add({ userId: ana.uid, nivel: 'verde' });

    const resultado = await descargarMisDatos(ana.idToken);
    if (!resultado.success) throw new Error(resultado.error);
    expect(JSON.stringify(resultado.data).toLowerCase()).not.toContain('triage');
  });
});

describe('Eliminar mi cuenta (Ley 1581, derecho de supresión)', () => {
  it('borra la cuenta de Auth y todo lo que colgaba de ella', async () => {
    const idHija = await sembrarCuenta(ana);
    const db = getAdminDb();
    await db.collection('app_triage_sessions').add({ userId: ana.uid, nivel: 'verde' });

    const resultado = await eliminarMiCuenta(ana.idToken, ana.email);
    expect(resultado).toMatchObject({ success: true, data: { uid: ana.uid } });

    for (const ruta of [
      `Cuentas_Tutor/${ana.uid}`,
      `Cuentas_Tutor/${ana.uid}/Integrantes/${idHija}`,
      `Cuentas_Tutor/${ana.uid}/Integrantes/${idHija}/historial/registro`,
      `Cuentas_Tutor/${ana.uid}/conversaciones/c1`,
      `Cuentas_Tutor/${ana.uid}/conversaciones/c1/mensajes/m1`,
      `Cuentas_Tutor/${ana.uid}/reports/r1`,
      `${COLECCION_MODALIDAD}/${ana.uid}`,
      `rate_limits/${ana.uid}`,
    ]) {
      expect((await db.doc(ruta).get()).exists, ruta).toBe(false);
    }
    expect((await db.collection('app_triage_sessions').where('userId', '==', ana.uid).get()).empty).toBe(true);
    await expect(getAdminAuth().getUser(ana.uid)).rejects.toThrow();
  });

  it('conserva la constancia de qué profesional abrió una consulta', async () => {
    await sembrarCuenta(ana);
    await getAdminDb().collection(COLECCION_AUDITORIA).add({
      medico: 'medico@ejemplo.test',
      accion: 'resumen',
      uid: ana.uid,
      convId: 'c1',
      en: new Date(),
    });

    expect((await eliminarMiCuenta(ana.idToken, ana.email)).success).toBe(true);

    const registros = await getAdminDb().collection(COLECCION_AUDITORIA).where('uid', '==', ana.uid).get();
    expect(registros.size).toBe(1);
    // El registro no guarda datos de salud: solo quién, qué y cuándo.
    expect(registros.docs[0].data()).toMatchObject({ medico: 'medico@ejemplo.test', accion: 'resumen' });
  });

  it('sin el correo exacto no borra nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await sembrarCuenta(ana);

    for (const escrito of ['', 'otro@ejemplo.test', ana.uid]) {
      expect((await eliminarMiCuenta(ana.idToken, escrito)).success, escrito).toBe(false);
    }
    expect((await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).get()).exists).toBe(true);
    await expect(getAdminAuth().getUser(ana.uid)).resolves.toBeTruthy();
  });

  it('acepta el correo con espacios y mayúsculas, que es como lo escribe la gente', async () => {
    await sembrarCuenta(ana);
    expect((await eliminarMiCuenta(ana.idToken, `  ${ana.email.toUpperCase()}  `)).success).toBe(true);
    expect((await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).get()).exists).toBe(false);
  });

  it('una sesión falsa no borra la cuenta de nadie', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await sembrarCuenta(ana);

    expect((await eliminarMiCuenta('token-inventado', ana.email)).success).toBe(false);
    // Beto tiene sesión válida, pero el correo que confirma es el suyo, no el de Ana:
    // el uid sale del token, así que no puede alcanzar la cuenta de Ana.
    expect((await eliminarMiCuenta(beto.idToken, ana.email)).success).toBe(false);
    expect((await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).get()).exists).toBe(true);
    await expect(getAdminAuth().getUser(ana.uid)).resolves.toBeTruthy();
  });
});
