import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '@/lib/firebase-admin';
import { getSecureFamilyMembers, getSecureMemberMedicalHistory, saveFamilyMember } from '@/app/actions/family';
import { getSecureUserDocument, updateSecureHealthInfo } from '@/app/actions/user';
import { crearUsuario, vaciarFirestore, type UsuarioDePrueba } from '../ayudas';

const hija = {
  firstName: 'Sofía',
  lastName: 'Pérez',
  sex: 'f',
  dateOfBirth: '2019-03-10T00:00:00.000Z',
  relationship: 'Hija',
  esTitular: false,
  allergies: ['amoxicilina'],
  medications: ['salbutamol'],
  pathologicalHistory: 'Asma leve',
};

let ana: UsuarioDePrueba;
let beto: UsuarioDePrueba;

beforeEach(async () => {
  await vaciarFirestore();
  ana = await crearUsuario();
  beto = await crearUsuario();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Familia (saveFamilyMember / getSecureFamilyMembers)', () => {
  it('guarda al integrante con alergias, medicamentos e historial cifrados', async () => {
    const resultado = await saveFamilyMember(ana.idToken, null, hija);
    expect(resultado.success).toBe(true);
    const id = (resultado as { id: string }).id;

    const integrante = (await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/Integrantes/${id}`).get()).data()!;
    expect(integrante.firstName).toBe('Sofía');
    expect(integrante.allergies).toBeUndefined();
    expect(integrante.encryptedAllergies).not.toContain('amoxicilina');
    expect(integrante.encryptedMedications).not.toContain('salbutamol');

    const historial = (await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/Integrantes/${id}/historial/registro`).get()).data()!;
    expect(historial.encrypted_pathologicalHistory).toBeDefined();
    expect(historial.encrypted_pathologicalHistory).not.toContain('Asma');
  });

  it('la dueña recibe a su familia descifrada', async () => {
    const { id } = (await saveFamilyMember(ana.idToken, null, hija)) as { id: string };

    const familia = await getSecureFamilyMembers(ana.idToken);
    expect(familia).toHaveLength(1);
    expect(familia[0]).toMatchObject({ id, firstName: 'Sofía', allergies: ['amoxicilina'], medications: ['salbutamol'] });

    const historial = await getSecureMemberMedicalHistory(ana.idToken, id);
    expect(historial.pathologicalHistory).toBe('Asma leve');
  });

  it('otra cuenta no ve a la familia de la dueña ni su historial', async () => {
    const { id } = (await saveFamilyMember(ana.idToken, null, hija)) as { id: string };
    expect(await getSecureFamilyMembers(beto.idToken)).toEqual([]);
    expect(await getSecureMemberMedicalHistory(beto.idToken, id)).toBeNull();
  });

  it('rechaza datos incompletos o campos que no existen', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sinNombre = await saveFamilyMember(ana.idToken, null, { ...hija, firstName: '' });
    expect(sinNombre.success).toBe(false);

    const campoExtra = await saveFamilyMember(ana.idToken, null, { ...hija, esAdministrador: true });
    expect(campoExtra.success).toBe(false);

    expect((await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/Integrantes`).get()).size).toBe(0);
  });

  it('una sesión falsa no guarda nada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resultado = await saveFamilyMember('token-inventado', null, hija);
    expect(resultado.success).toBe(false);
  });
});

describe('Datos de salud de la cuenta (updateSecureHealthInfo / getSecureUserDocument)', () => {
  beforeEach(async () => {
    await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).set({
      personalInfo: { firstName: 'Ana', lastName: 'Pérez', sex: 'f', dateOfBirth: '1991-07-02T00:00:00.000Z' },
      healthInfo: {},
    });
  });

  it('guarda la información de salud cifrada y la devuelve descifrada a su dueña', async () => {
    const resultado = await updateSecureHealthInfo(ana.idToken, {
      allergies: ['ibuprofeno'],
      medications: ['levotiroxina'],
      pathologicalHistory: 'Hipotiroidismo',
    });
    expect(resultado).toEqual({ success: true });

    const guardado = (await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}`).get()).data()!;
    expect(guardado.healthInfo.allergies).toBeUndefined();
    expect(guardado.healthInfo.encryptedAllergies).not.toContain('ibuprofeno');
    expect(guardado.healthInfo.encrypted_pathologicalHistory).not.toContain('Hipotiroidismo');

    const documento = await getSecureUserDocument(ana.idToken);
    expect(documento?.personalInfo.firstName).toBe('Ana');
    expect(documento?.healthInfo.allergies).toEqual(['ibuprofeno']);
    expect(documento?.healthInfo.pathologicalHistory).toBe('Hipotiroidismo');
  });

  it('otra cuenta solo puede leer su propio documento', async () => {
    expect(await getSecureUserDocument(beto.idToken)).toBeNull();
  });

  it('rechaza campos que no existen en la información de salud', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const resultado = await updateSecureHealthInfo(ana.idToken, { allergies: [], rol: 'admin' });
    expect(resultado.success).toBe(false);
  });
});
