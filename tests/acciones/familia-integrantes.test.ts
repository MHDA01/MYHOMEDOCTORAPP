import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  deleteFamilyMember,
  getSecureFamilyMembers,
  getSecureFamilyTree,
  getSecureMemberMedicalHistory,
  saveFamilyMember,
  saveTitularProfile,
} from '@/app/actions/family';
import { getSecureUserDocument, updateSecureHealthInfo } from '@/app/actions/user';
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

const rutaIntegrante = (uid: string, id: string) => `Cuentas_Tutor/${uid}/Integrantes/${id}`;

beforeEach(async () => {
  await vaciarFirestore();
  ana = await crearUsuario();
  beto = await crearUsuario();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Familia: formatos de sexo y fecha', () => {
  it('acepta sexo male/female y fecha AAAA-MM-DD, y los guarda normalizados', async () => {
    const { id } = (await saveFamilyMember(ana.idToken, null, hija)) as { id: string };
    const guardado = (await getAdminDb().doc(rutaIntegrante(ana.uid, id)).get()).data()!;
    expect(guardado.sex).toBe('female');
    expect(guardado.dateOfBirth).toBe('2019-03-10');

    const [sofia] = await getSecureFamilyMembers(ana.idToken);
    expect(sofia).toMatchObject({ sex: 'female', dateOfBirth: '2019-03-10' });
  });

  it('un sexo m/f y una fecha con hora del esquema anterior salen normalizados', async () => {
    await saveFamilyMember(ana.idToken, null, { ...hija, sex: 'f', dateOfBirth: '2019-03-10T00:00:00.000Z' });
    const [sofia] = await getSecureFamilyMembers(ana.idToken);
    expect(sofia.sex).toBe('female');
    expect(sofia.dateOfBirth).toBe('2019-03-10');
  });

  it('rechaza fechas imposibles, futuras o vacías', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await saveFamilyMember(ana.idToken, null, { ...hija, dateOfBirth: '2019-02-31' })).success).toBe(false);
    expect((await saveFamilyMember(ana.idToken, null, { ...hija, dateOfBirth: '2999-01-01' })).success).toBe(false);
    expect((await saveFamilyMember(ana.idToken, null, { ...hija, dateOfBirth: '' })).success).toBe(false);
  });

  it('lee alergias y medicamentos que quedaron en claro en el sistema anterior', async () => {
    await getAdminDb().doc(rutaIntegrante(ana.uid, 'vieja')).set({
      firstName: 'Fanny',
      lastName: 'Gómez',
      sex: 'female',
      dateOfBirth: '1950-05-05',
      relationship: 'Madre',
      isEncrypted: true,
      allergies: ['látex'],
      medications: ['metformina'],
    });
    const [fanny] = await getSecureFamilyMembers(ana.idToken);
    expect(fanny).toMatchObject({ id: 'vieja', allergies: ['látex'], medications: ['metformina'] });
  });
});

describe('Familia: historial y familiograma', () => {
  it('marca hasHistory, y al vaciar un antecedente este se borra de verdad', async () => {
    const { id } = (await saveFamilyMember(ana.idToken, null, hija)) as { id: string };
    expect((await getSecureFamilyMembers(ana.idToken))[0].hasHistory).toBe(true);

    await saveFamilyMember(ana.idToken, id, { ...hija, pathologicalHistory: '' });
    expect((await getSecureFamilyMembers(ana.idToken))[0].hasHistory).toBe(false);
    expect((await getSecureMemberMedicalHistory(ana.idToken, id)).pathologicalHistory).toBe('');
    const historial = (await getAdminDb().doc(`${rutaIntegrante(ana.uid, id)}/historial/registro`).get()).data()!;
    expect(historial.encrypted_pathologicalHistory).toBeUndefined();
  });

  it('editar no crea otro integrante ni pisa la fecha de creación', async () => {
    const { id } = (await saveFamilyMember(ana.idToken, null, hija)) as { id: string };
    const antes = (await getAdminDb().doc(rutaIntegrante(ana.uid, id)).get()).data()!;
    await saveFamilyMember(ana.idToken, id, { ...hija, firstName: 'Sofía Isabel' });
    const despues = (await getAdminDb().doc(rutaIntegrante(ana.uid, id)).get()).data()!;
    expect(despues.firstName).toBe('Sofía Isabel');
    expect(despues.createdAt.toMillis()).toBe(antes.createdAt.toMillis());
    expect((await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/Integrantes`).get()).size).toBe(1);
  });

  it('no deja editar un integrante que no existe ni crear un segundo titular', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect((await saveFamilyMember(ana.idToken, 'no-existe', hija)).success).toBe(false);
    expect((await saveFamilyMember(ana.idToken, 'titular', hija)).success).toBe(false);
    expect((await saveFamilyMember(ana.idToken, null, { ...hija, esTitular: true })).success).toBe(false);
    expect((await saveFamilyMember(ana.idToken, null, { ...hija, relationship: 'Titular' })).success).toBe(false);
    expect((await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/Integrantes`).get()).size).toBe(0);
  });

  it('el titular sale primero, desde la cuenta, y el árbol trae el historial de todos', async () => {
    await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).set({
      personalInfo: { firstName: 'Ana', lastName: 'Pérez', sex: 'female', dateOfBirth: new Date('1991-07-02T12:00:00.000Z'), country: 'colombia' },
      healthInfo: {},
    });
    await updateSecureHealthInfo(ana.idToken, { allergies: ['ibuprofeno'], pathologicalHistory: 'Hipotiroidismo' });
    await saveFamilyMember(ana.idToken, null, hija);

    const arbol = await getSecureFamilyTree(ana.idToken);
    if (!arbol.success) throw new Error(arbol.error);
    expect(arbol.members.map((m) => m.firstName)).toEqual(['Ana', 'Sofía']);
    expect(arbol.members[0]).toMatchObject({
      id: 'titular',
      esTitular: true,
      relationship: 'Titular',
      dateOfBirth: '1991-07-02',
      allergies: ['ibuprofeno'],
      pathologicalHistory: 'Hipotiroidismo',
    });
    expect(arbol.members[1]).toMatchObject({ allergies: ['amoxicilina'], medications: ['salbutamol'], pathologicalHistory: 'Asma leve' });
  });

  it('otra cuenta recibe su propio árbol, no el de la dueña', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await saveFamilyMember(ana.idToken, null, hija);
    expect(await getSecureFamilyTree(beto.idToken)).toEqual({ success: true, members: [] });
    expect((await getSecureFamilyTree('token-inventado')).success).toBe(false);
  });
});

describe('Perfil del titular (saveTitularProfile)', () => {
  beforeEach(async () => {
    await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).set({
      personalInfo: { firstName: 'Ana', lastName: 'Pérez', sex: 'other', dateOfBirth: new Date('1991-07-02T12:00:00.000Z'), country: 'colombia' },
      healthInfo: { emergencyContacts: [{ name: 'Beto', phone: '3000000000' }] },
    });
  });

  it('actualiza datos y salud cifrada sin borrar los contactos de emergencia', async () => {
    const resultado = await saveTitularProfile(ana.idToken, {
      firstName: 'Ana María',
      lastName: 'Pérez',
      sex: 'female',
      dateOfBirth: '1991-07-02',
      weight: 62,
      country: 'colombia',
      insuranceProvider: 'EPS contributiva',
      insuranceProviderName: 'Sura',
      allergies: ['ibuprofeno'],
      medications: ['levotiroxina'],
      pathologicalHistory: 'Hipotiroidismo',
    });
    expect(resultado.success).toBe(true);

    const guardado = (await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).get()).data()!;
    expect(guardado.healthInfo.emergencyContacts).toHaveLength(1);
    expect(guardado.healthInfo.encryptedAllergies).not.toContain('ibuprofeno');
    expect(guardado.healthInfo.encrypted_pathologicalHistory).not.toContain('Hipotiroidismo');

    const [titular] = await getSecureFamilyMembers(ana.idToken);
    expect(titular).toMatchObject({
      firstName: 'Ana María',
      sex: 'female',
      dateOfBirth: '1991-07-02',
      weight: 62,
      insuranceProviderName: 'Sura',
      allergies: ['ibuprofeno'],
      medications: ['levotiroxina'],
    });
    expect((await getSecureUserDocument(ana.idToken))?.healthInfo.pathologicalHistory).toBe('Hipotiroidismo');
  });

  it('rechaza datos inválidos y campos que no existen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = { firstName: 'Ana', lastName: 'Pérez', sex: 'female', dateOfBirth: '1991-07-02' };
    expect((await saveTitularProfile(ana.idToken, { ...base, firstName: '' })).success).toBe(false);
    expect((await saveTitularProfile(ana.idToken, { ...base, rol: 'admin' })).success).toBe(false);
    expect((await saveTitularProfile('token-inventado', base)).success).toBe(false);
  });

  it('una cuenta sin documento no puede crear uno con este perfil', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const base = { firstName: 'Beto', lastName: 'Ruiz', sex: 'male', dateOfBirth: '1990-01-01' };
    expect((await saveTitularProfile(beto.idToken, base)).success).toBe(false);
  });
});

describe('Eliminar integrante (deleteFamilyMember)', () => {
  async function sembrarFamiliaConHuellas() {
    const { id } = (await saveFamilyMember(ana.idToken, null, hija)) as { id: string };
    const db = getAdminDb();
    await db.doc(`${rutaIntegrante(ana.uid, id)}/Documentos/examen1`).set({ name: 'Hemograma' });
    await db.doc(`${rutaIntegrante(ana.uid, id)}/episodes/e1/events/ev1`).set({ texto: 'tos' });
    await db.doc(`Cuentas_Tutor/${ana.uid}/conversaciones/c-sofia`).set({ memberId: id, memberName: 'Sofía' });
    await db.doc(`Cuentas_Tutor/${ana.uid}/conversaciones/c-sofia/mensajes/m1`).set({ content: 'hola' });
    await db.doc(`Cuentas_Tutor/${ana.uid}/conversaciones/c-otra`).set({ memberId: 'otra-persona', memberName: 'Otra' });
    return id;
  }

  it('borra el perfil y todo lo que colgaba de él, incluidas sus conversaciones', async () => {
    const id = await sembrarFamiliaConHuellas();
    const db = getAdminDb();

    const resultado = await deleteFamilyMember(ana.idToken, id);
    expect(resultado).toMatchObject({ success: true, conversacionesEliminadas: 1 });

    for (const ruta of [
      rutaIntegrante(ana.uid, id),
      `${rutaIntegrante(ana.uid, id)}/historial/registro`,
      `${rutaIntegrante(ana.uid, id)}/Documentos/examen1`,
      `${rutaIntegrante(ana.uid, id)}/episodes/e1/events/ev1`,
      `Cuentas_Tutor/${ana.uid}/conversaciones/c-sofia`,
      `Cuentas_Tutor/${ana.uid}/conversaciones/c-sofia/mensajes/m1`,
    ]) {
      expect((await db.doc(ruta).get()).exists, ruta).toBe(false);
    }
    // La conversación de otra persona no se toca.
    expect((await db.doc(`Cuentas_Tutor/${ana.uid}/conversaciones/c-otra`).get()).exists).toBe(true);
    expect(await getSecureFamilyMembers(ana.idToken)).toEqual([]);
  });

  it('otra cuenta no puede eliminar a un integrante que no es suyo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const id = await sembrarFamiliaConHuellas();
    expect((await deleteFamilyMember(beto.idToken, id)).success).toBe(false);
    expect((await getAdminDb().doc(rutaIntegrante(ana.uid, id)).get()).exists).toBe(true);
  });

  it('no elimina al titular ni acepta ids inventados o una sesión falsa', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await getAdminDb().doc(rutaIntegrante(ana.uid, 'viejo-titular')).set({ firstName: 'Ana', relationship: 'Titular', esTitular: true });
    expect((await deleteFamilyMember(ana.idToken, 'viejo-titular')).success).toBe(false);
    expect((await deleteFamilyMember(ana.idToken, 'titular')).success).toBe(false);
    expect((await deleteFamilyMember(ana.idToken, '../otra')).success).toBe(false);
    expect((await deleteFamilyMember(ana.idToken, 'no-existe')).success).toBe(false);
    expect((await deleteFamilyMember('token-inventado', 'x')).success).toBe(false);
    expect((await getAdminDb().doc(rutaIntegrante(ana.uid, 'viejo-titular')).get()).exists).toBe(true);
  });
});
