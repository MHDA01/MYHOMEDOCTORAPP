import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * crypto.ts lee MHDA_ENCRYPTION_KEY al cargarse, así que los casos con otra clave
 * (o sin clave) recargan el módulo con vi.resetModules().
 */
async function cargarCifrado(clave: string | undefined) {
  vi.resetModules();
  const anterior = process.env.MHDA_ENCRYPTION_KEY;
  if (clave === undefined) delete process.env.MHDA_ENCRYPTION_KEY;
  else process.env.MHDA_ENCRYPTION_KEY = clave;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const modulo = await import('@/lib/crypto');
  process.env.MHDA_ENCRYPTION_KEY = anterior;
  return modulo;
}

const clavePrueba = Buffer.alloc(32, 7).toString('base64');
const texto = 'Alergias: penicilina, ibuprofeno';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Cifrado de datos de salud (AES-256-GCM)', () => {
  it('cifra y descifra sin perder caracteres del español ni textos largos', async () => {
    const { encryptField, decryptField } = await cargarCifrado(clavePrueba);
    for (const valor of [texto, 'Diabetes tipo 2, hipertensión, ñandú', 'a'.repeat(5000), '["uno","dos"]']) {
      const cifrado = encryptField(valor);
      expect(cifrado.split('.')).toHaveLength(3);
      expect(cifrado).not.toContain(valor.slice(0, 10));
      expect(decryptField(cifrado)).toBe(valor);
    }
  });

  it('el mismo texto se cifra distinto cada vez (IV aleatorio)', async () => {
    const { encryptField } = await cargarCifrado(clavePrueba);
    expect(encryptField(texto)).not.toBe(encryptField(texto));
  });

  it('los textos vacíos y los que no están cifrados pasan sin cambios', async () => {
    const { encryptField, decryptField } = await cargarCifrado(clavePrueba);
    expect(encryptField('')).toBe('');
    expect(decryptField('')).toBe('');
    expect(decryptField('texto plano sin puntos')).toBe('texto plano sin puntos');
  });

  it('sin clave configurada no cifra (lanza error en vez de guardar en claro)', async () => {
    const { encryptField } = await cargarCifrado(undefined);
    expect(() => encryptField(texto)).toThrow('Encryption key missing');
  });

  it('en producción detecta datos alterados o una clave equivocada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubEnv('NODE_ENV', 'production');
    const original = await cargarCifrado(clavePrueba);
    const cifrado = original.encryptField(texto);
    const [iv, tag, contenido] = cifrado.split('.');

    expect(() => original.decryptField(`${iv}.${tag}.${contenido.slice(0, -4)}AAAA`)).toThrow(/Failed to decrypt/);
    expect(() => original.decryptField(`${iv}.AAAAAAAAAAAAAAAAAAAAAA==.${contenido}`)).toThrow(/Failed to decrypt/);

    const otraClave = await cargarCifrado(Buffer.alloc(32, 9).toString('base64'));
    expect(() => otraClave.decryptField(cifrado)).toThrow(/Failed to decrypt/);
  });
});
