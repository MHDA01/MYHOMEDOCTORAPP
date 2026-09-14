import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { PROYECTO } from '../ayudas';

let entorno: RulesTestEnvironment;

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: PROYECTO,
    firestore: { rules: readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') },
  });
});

beforeEach(async () => {
  await entorno.clearFirestore();
  // Datos de la cuenta "ana", escritos saltándose las reglas.
  await entorno.withSecurityRulesDisabled(async (contexto) => {
    const db = contexto.firestore();
    await setDoc(doc(db, 'Cuentas_Tutor/ana'), { personalInfo: { firstName: 'Ana' } });
    await setDoc(doc(db, 'Cuentas_Tutor/ana/conversaciones/c1'), { messageCount: 1 });
    await setDoc(doc(db, 'Cuentas_Tutor/ana/conversaciones/c1/mensajes/m1'), { content: 'cifrado' });
    await setDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/hija'), { firstName: 'Sofía' });
    await setDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/hija/historial/registro'), { encrypted_x: '...' });
    await setDoc(doc(db, 'Cuentas_Tutor/ana/tokens/config'), { free: 6, paid: 0 });
  });
});

afterAll(async () => {
  await entorno?.cleanup();
});

describe('Cuentas_Tutor: cada cuenta solo ve y cambia lo suyo', () => {
  it('la dueña lee y escribe su cuenta, sus conversaciones y su familia', async () => {
    const db = entorno.authenticatedContext('ana').firestore();
    await assertSucceeds(getDoc(doc(db, 'Cuentas_Tutor/ana')));
    await assertSucceeds(getDoc(doc(db, 'Cuentas_Tutor/ana/conversaciones/c1/mensajes/m1')));
    await assertSucceeds(addDoc(collection(db, 'Cuentas_Tutor/ana/conversaciones'), { status: 'active' }));
    await assertSucceeds(getDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/hija/historial/registro')));
    await assertSucceeds(setDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/hijo'), { firstName: 'Tomás' }));
  });

  it('otra cuenta no puede leer nada de la dueña', async () => {
    const db = entorno.authenticatedContext('beto').firestore();
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana')));
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana/conversaciones/c1')));
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana/conversaciones/c1/mensajes/m1')));
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/hija')));
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/hija/historial/registro')));
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana/tokens/config')));
  });

  it('otra cuenta no puede escribir en la cuenta de la dueña', async () => {
    const db = entorno.authenticatedContext('beto').firestore();
    await assertFails(setDoc(doc(db, 'Cuentas_Tutor/ana'), { personalInfo: { firstName: 'Beto' } }));
    await assertFails(addDoc(collection(db, 'Cuentas_Tutor/ana/conversaciones/c1/mensajes'), { content: 'falso' }));
    await assertFails(setDoc(doc(db, 'Cuentas_Tutor/ana/Integrantes/intruso'), { firstName: 'X' }));
  });

  it('sin sesión no se puede leer ni escribir', async () => {
    const db = entorno.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'Cuentas_Tutor/ana')));
    await assertFails(setDoc(doc(db, 'Cuentas_Tutor/nadie'), { a: 1 }));
  });
});

describe('Colecciones cerradas', () => {
  it('users y cualquier colección no declarada están cerradas', async () => {
    const db = entorno.authenticatedContext('ana').firestore();
    await assertFails(getDoc(doc(db, 'users/ana')));
    await assertFails(setDoc(doc(db, 'protocolos_publicados/diarrea'), { a: 1 }));
    await assertFails(getDoc(doc(db, 'rate_limits/ana')));
  });

  it('triage_logs: se puede crear con sesión pero no leer', async () => {
    const db = entorno.authenticatedContext('ana').firestore();
    await assertSucceeds(addDoc(collection(db, 'triage_logs'), { nivel: 'verde' }));
    await assertFails(getDoc(doc(db, 'triage_logs/cualquiera')));
  });
});

describe('Saldo y pagos (hallazgo C1 de la auditoría)', () => {
  // Hoy la regla general `match /{subcol}/{docId}` anula el `allow write: if false`
  // de tokens y transactions. Estas pruebas están marcadas como "falla esperada":
  // cuando se corrija la regla (paso 5) empezarán a pasar y habrá que quitarles
  // el `.fails` para que queden como protección permanente.
  it.fails('la dueña no debería poder cambiar su saldo de tokens', async () => {
    const db = entorno.authenticatedContext('ana').firestore();
    await assertFails(setDoc(doc(db, 'Cuentas_Tutor/ana/tokens/config'), { free: 6, paid: 999 }));
  });

  it.fails('la dueña no debería poder registrar un pago', async () => {
    const db = entorno.authenticatedContext('ana').firestore();
    await assertFails(addDoc(collection(db, 'Cuentas_Tutor/ana/transactions'), { status: 'success' }));
  });
});
