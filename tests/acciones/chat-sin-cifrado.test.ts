import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAdminDb } from '@/lib/firebase-admin';
import { crearUsuario, fetchFalso, respuestaGemini, vaciarFirestore } from '../ayudas';

// Simula que la clave de cifrado falta en el servidor: cifrar lanza error.
vi.mock('@/lib/crypto', () => ({
  encryptField: () => {
    throw new Error('Encryption key missing');
  },
  decryptField: (valor: string) => valor,
}));

const { enviarMensajeConsulta, persistSecureMessage } = await import('@/app/actions/teleorientacion');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Si el cifrado falla, nada queda en texto plano', () => {
  it('no guarda la pregunta ni llama a la IA', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await vaciarFirestore();
    const ana = await crearUsuario();
    await getAdminDb().doc(`Cuentas_Tutor/${ana.uid}/conversaciones/c1`).set({ status: 'active' });
    const { falso, llamadasGemini } = fetchFalso(() => respuestaGemini('no debería llegar'));
    vi.stubGlobal('fetch', falso);

    const resultado = await enviarMensajeConsulta(ana.idToken, 'c1', { texto: 'Tengo VIH' }, { firstName: 'Ana', lastName: 'P' });
    expect(resultado.success).toBe(false);
    expect((await persistSecureMessage(ana.idToken, 'c1', { role: 'assistant', content: 'dato' })).success).toBe(false);

    const mensajes = await getAdminDb().collection(`Cuentas_Tutor/${ana.uid}/conversaciones/c1/mensajes`).get();
    expect(mensajes.size).toBe(0);
    expect(llamadasGemini).toHaveLength(0);
  });
});
