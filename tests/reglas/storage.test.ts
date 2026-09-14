import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';
import { PROYECTO } from '../ayudas';

let entorno: RulesTestEnvironment;
const imagen = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

beforeAll(async () => {
  entorno = await initializeTestEnvironment({
    projectId: PROYECTO,
    storage: { rules: readFileSync(path.resolve(__dirname, '../../storage.rules'), 'utf8') },
  });
});

afterAll(async () => {
  await entorno?.cleanup();
});

describe('Fotos del chat (medical-images)', () => {
  it('la dueña sube y ve sus propias fotos', async () => {
    const storage = entorno.authenticatedContext('ana').storage();
    const archivo = ref(storage, 'medical-images/ana/c1/foto.jpg');
    await assertSucceeds(uploadBytes(archivo, imagen, { contentType: 'image/jpeg' }));
    await assertSucceeds(getBytes(archivo));
  });

  it('otra cuenta no puede ver ni subir fotos en la carpeta de la dueña', async () => {
    await entorno.withSecurityRulesDisabled(async (contexto) => {
      await uploadBytes(ref(contexto.storage(), 'medical-images/ana/c1/privada.jpg'), imagen, { contentType: 'image/jpeg' });
    });
    const storage = entorno.authenticatedContext('beto').storage();
    await assertFails(getBytes(ref(storage, 'medical-images/ana/c1/privada.jpg')));
    await assertFails(uploadBytes(ref(storage, 'medical-images/ana/c1/intruso.jpg'), imagen, { contentType: 'image/jpeg' }));
  });

  it('no acepta archivos que no sean imágenes ni de más de 10 MB', async () => {
    const storage = entorno.authenticatedContext('ana').storage();
    await assertFails(uploadBytes(ref(storage, 'medical-images/ana/c1/script.html'), imagen, { contentType: 'text/html' }));
    const grande = new Uint8Array(10 * 1024 * 1024 + 1);
    await assertFails(uploadBytes(ref(storage, 'medical-images/ana/c1/enorme.jpg'), grande, { contentType: 'image/jpeg' }));
  });

  it('sin sesión no se puede subir', async () => {
    const storage = entorno.unauthenticatedContext().storage();
    await assertFails(uploadBytes(ref(storage, 'medical-images/ana/c1/anonima.jpg'), imagen, { contentType: 'image/jpeg' }));
  });
});

describe('Rutas no declaradas', () => {
  it('cualquier otra carpeta está cerrada', async () => {
    const storage = entorno.authenticatedContext('ana').storage();
    await assertFails(uploadBytes(ref(storage, 'protocolos/biblioteca/texto/x.json'), imagen, { contentType: 'image/jpeg' }));
  });
});
