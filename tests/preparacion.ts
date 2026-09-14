/**
 * Se ejecuta antes de cada archivo de pruebas.
 *
 * Deja el proceso apuntando solo a los emuladores y quita cualquier credencial real
 * que pudiera venir del entorno, para que un error de configuración nunca termine
 * escribiendo en producción.
 */
const CREDENCIALES_REALES = [
  'MHD_FIREBASE_PROJECT_ID',
  'MHD_FIREBASE_CLIENT_EMAIL',
  'MHD_FIREBASE_PRIVATE_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
];
for (const nombre of CREDENCIALES_REALES) delete process.env[nombre];

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  throw new Error(
    'Las pruebas deben correr contra los emuladores de Firebase. Usa `npm test` (requiere Java 21).'
  );
}

process.env.GCLOUD_PROJECT = 'demo-mhda';
process.env.GOOGLE_CLOUD_PROJECT = 'demo-mhda';
// Clave de cifrado solo para pruebas (32 bytes en base64). No es la de producción.
process.env.MHDA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GEMINI_API_KEY = 'clave-de-prueba';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-mhda.appspot.com';
