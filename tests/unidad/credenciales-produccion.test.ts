/**
 * Que ninguna credencial de servidor se lea con un nombre que en producción no
 * existe.
 *
 * Por qué existe esta prueba: el 26-oct se publicó la voz de servidor de Hilda
 * y en producción habló con la voz robótica del navegador. El código no estaba
 * mal escrito ni la API fallaba — `voz-hilda.ts` leía `FIREBASE_CLIENT_EMAIL`,
 * que es el nombre de `.env.local`, mientras en producción la variable se llama
 * `MHD_FIREBASE_CLIENT_EMAIL`, que es como está declarada en `apphosting.yaml`.
 * La acción lanzaba "faltan las credenciales", y como el modo conversación tiene
 * el sintetizador del aparato como respaldo a propósito, **el fallo no se vio**:
 * Hilda siguió hablando, solo que como un robot. Funcionaba en local, así que
 * ninguna prueba ni ninguna revisión lo habría cazado.
 *
 * Son dos reglas, y la primera es la que falló:
 *
 *  1. Quien lea una credencial por el nombre corto debe leer también el nombre
 *     con prefijo `MHD_`, como hace `firebase-admin.ts`. Si no, funciona en
 *     local y calla en producción.
 *  2. Lo que el código lee tiene que estar declarado en `apphosting.yaml`, o en
 *     producción no llega.
 *
 * No se mira `functions/`: se despliega aparte y recibe las credenciales del
 * entorno de Cloud Functions, no de `apphosting.yaml`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = join(__dirname, '..', '..');
const SRC = join(RAIZ, 'src');

/** Las credenciales de la cuenta de servicio, que en producción van con `MHD_`. */
const CREDENCIALES = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];

function archivosDeCodigo(carpeta: string): string[] {
  return readdirSync(carpeta).flatMap((nombre) => {
    const ruta = join(carpeta, nombre);
    if (statSync(ruta).isDirectory()) return archivosDeCodigo(ruta);
    return /\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

const archivos = archivosDeCodigo(SRC).map((ruta) => ({
  ruta: ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'),
  texto: readFileSync(ruta, 'utf8'),
}));

const apphosting = readFileSync(join(RAIZ, 'apphosting.yaml'), 'utf8');
const declaradas = new Set(
  [...apphosting.matchAll(/^\s*-\s*variable:\s*([A-Z0-9_]+)\s*$/gm)].map((m) => m[1])
);

describe('Credenciales de servidor y producción', () => {
  it('encuentra código que leer y variables declaradas (si no, la prueba no prueba nada)', () => {
    expect(archivos.length).toBeGreaterThan(20);
    expect(declaradas.size).toBeGreaterThan(5);
  });

  it.each(CREDENCIALES)(
    'quien lee %s por el nombre corto lee también el nombre con prefijo MHD_',
    (credencial) => {
      const corto = new RegExp(`process\\.env\\.${credencial}\\b`);
      const conPrefijo = new RegExp(`process\\.env\\.MHD_${credencial}\\b`);

      const culpables = archivos
        .filter(({ texto }) => corto.test(texto) && !conPrefijo.test(texto))
        .map(({ ruta }) => ruta);

      expect(
        culpables,
        `${culpables.join(', ')} lee process.env.${credencial} pero no MHD_${credencial}. ` +
          `En producción solo existe la variante MHD_ (ver apphosting.yaml), así que esto ` +
          `funciona en local y falla publicado.`
      ).toEqual([]);
    }
  );

  it('las credenciales con prefijo MHD_ están declaradas en apphosting.yaml', () => {
    const faltantes = CREDENCIALES.map((c) => `MHD_${c}`).filter((v) => !declaradas.has(v));
    expect(faltantes, `sin declarar en apphosting.yaml: ${faltantes.join(', ')}`).toEqual([]);
  });

  it('los secretos que el código exige sin alternativa están declarados', () => {
    // Estas no tienen valor por defecto en el código: si no llegan, la función
    // que las usa falla. Se listan a mano a propósito, porque distinguir
    // automáticamente una variable obligatoria de una con valor por defecto
    // daría falsos positivos (FREE_TOKENS_PER_DAY, por ejemplo, tiene el suyo).
    for (const variable of ['GEMINI_API_KEY', 'MHDA_ENCRYPTION_KEY', 'ADMIN_EMAILS']) {
      expect(declaradas.has(variable), `${variable} no está en apphosting.yaml`).toBe(true);
    }
  });
});
