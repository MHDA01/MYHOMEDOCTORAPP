import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas automáticas de MHDA. Se corren con `npm test`, que levanta los
 * emuladores de Firebase (Auth, Firestore y Storage) en el proyecto de mentira
 * demo-mhda: ninguna prueba toca la base de datos de producción.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/preparacion.ts'],
    // Los emuladores son un único estado compartido: los archivos corren de a uno.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
