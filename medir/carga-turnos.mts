/**
 * Cuántos turnos de teleorientación aguanta UNA instancia a la vez.
 *
 * ## Qué mide y qué NO mide
 *
 * Mide **lo nuestro**: verificar la sesión, guardar la pregunta cifrada,
 * comprobar los permisos, leer el historial, leer la ficha, orquestar las dos
 * llamadas al modelo y guardar la respuesta. Todo eso corriendo en un solo
 * proceso de Node, igual que una instancia de App Hosting, con N turnos
 * encima a la vez.
 *
 * **No mide** —y por eso ningún número de aquí se puede presentar como "la app
 * aguanta N usuarios"—:
 *
 *  - **Gemini.** Se reemplaza por una respuesta falsa con una demora fija. Es
 *    la única forma de medir esto sin gastar: mil turnos de verdad se pagan. La
 *    demora simulada sale de lo medido el 9-nov-2026 y se puede cambiar por
 *    variable de entorno.
 *  - **Firestore de verdad.** Aquí es el emulador: un proceso local, sin
 *    cuotas, sin red y sin los límites de escritura por documento. Es más
 *    rápido y más permisivo que el real.
 *  - **La red.** Cliente y servidor son el mismo proceso.
 *  - **La máquina.** `apphosting.yaml` da 1 CPU y 512 MiB por instancia. Un
 *    portátil tiene más de las dos cosas, así que estos tiempos son
 *    OPTIMISTAS. El pico de memoria que se reporta abajo es justo para poder
 *    comparar contra esos 512 MiB.
 *
 * Lo que sí se puede concluir: si lo nuestro ya se degrada con N turnos en un
 * portátil, en producción se degrada antes. Es una cota superior, no una
 * promesa.
 *
 * ## Cómo se corre
 *
 *     npm run medir:carga
 *     $env:NIVELES="1,40,80,320"; npm run medir:carga
 *
 * Los niveles van por variable de entorno y no por argumento porque `npm run
 * ... -- 80` se los daría a `firebase emulators:exec`, no a este archivo.
 *
 * Requiere Java 21 (los emuladores). Nunca toca producción: las credenciales
 * reales se borran del proceso antes de cargar nada, igual que en las pruebas.
 *
 * Variables: DEMORA_HILDA_MS, DEMORA_EXTRACTOR_MS.
 */
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// El entorno, antes de importar nada que lea credenciales.
// ---------------------------------------------------------------------------
for (const nombre of [
  'MHD_FIREBASE_PROJECT_ID',
  'MHD_FIREBASE_CLIENT_EMAIL',
  'MHD_FIREBASE_PRIVATE_KEY',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_APPLICATION_CREDENTIALS',
]) {
  delete process.env[nombre];
}

const PROYECTO = 'demo-mhda';
process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= '127.0.0.1:9199';
process.env.GCLOUD_PROJECT = PROYECTO;
process.env.GOOGLE_CLOUD_PROJECT = PROYECTO;
process.env.MHDA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.GEMINI_API_KEY = 'clave-de-prueba';
process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = 'demo-mhda.appspot.com';

if (process.env.FIRESTORE_EMULATOR_HOST?.includes('firestore.googleapis.com')) {
  throw new Error('Esto solo corre contra emuladores.');
}

const DEMORA_HILDA_MS = Number(process.env.DEMORA_HILDA_MS ?? 3_000);
const DEMORA_EXTRACTOR_MS = Number(process.env.DEMORA_EXTRACTOR_MS ?? 1_500);
/** El turno no puede bajar de aquí: las dos llamadas corren a la vez. */
const PISO_IA_MS = Math.max(DEMORA_HILDA_MS, DEMORA_EXTRACTOR_MS);

const NIVELES = (() => {
  const crudo = [...(process.env.NIVELES ?? '').split(/[,\s]+/), ...process.argv.slice(2)];
  const pedidos = crudo.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  return pedidos.length > 0 ? pedidos : [1, 10, 40, 80, 160, 320];
})();

// ---------------------------------------------------------------------------
// Gemini falso, con demora.
// ---------------------------------------------------------------------------
const fetchReal: typeof fetch = globalThis.fetch.bind(globalThis);
const dormir = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

let llamadasAHilda = 0;
let llamadasAlExtractor = 0;

function respuestaDeHilda(): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              {
                text:
                  'Gracias por contarme. Por lo que describes, conviene que te valore una persona ' +
                  'del equipo médico. Mientras tanto, mantente en reposo y toma líquidos.',
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 180, cachedContentTokenCount: 0, thoughtsTokenCount: 0 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function respuestaDelExtractor(): Response {
  const hallazgos = {
    hallazgos: [
      { id: 'dolor_toracico', estado: 'positivo', frase: 'me duele el pecho' },
      { id: 'intensidad', estado: 'positivo', valor: '7', frase: 'un 7 de 10' },
    ],
  };
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(hallazgos) }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 1150, candidatesTokenCount: 90, cachedContentTokenCount: 0, thoughtsTokenCount: 0 },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;

  // Los emuladores sí son de verdad: son la parte que queremos medir.
  if (url.includes('127.0.0.1') || url.includes('localhost')) return fetchReal(entrada, init);

  if (url.includes('generativelanguage.googleapis.com')) {
    // Solo el extractor pide molde (`responseSchema`). Es la misma forma de
    // distinguirlos que usan las pruebas de chat.
    let esExtractor = false;
    try {
      esExtractor = Boolean(JSON.parse(String(init?.body ?? '{}'))?.generationConfig?.responseSchema);
    } catch {
      esExtractor = false;
    }
    if (esExtractor) {
      llamadasAlExtractor += 1;
      await dormir(DEMORA_EXTRACTOR_MS);
      return respuestaDelExtractor();
    }
    llamadasAHilda += 1;
    await dormir(DEMORA_HILDA_MS);
    return respuestaDeHilda();
  }

  throw new Error(`La medición no debe salir a la red: ${url}`);
}) as typeof fetch;

// ---------------------------------------------------------------------------
// Las piezas de la app, ya con el entorno puesto.
// ---------------------------------------------------------------------------
const { enviarMensajeConsulta } = await import('@/app/actions/teleorientacion');
const { getAdminDb } = await import('@/lib/firebase-admin');
const { ID_TITULAR } = await import('@/lib/paciente-de-consulta');

type PacienteDeLaPrueba = Parameters<typeof enviarMensajeConsulta>[3];

/** Datos ficticios. Nunca los de una persona real (Ley 1581). */
const paciente: PacienteDeLaPrueba = {
  firstName: 'Ana',
  lastName: 'Pérez',
  age: 34,
  sex: 'f',
  allergies: ['penicilina'],
  medications: ['levotiroxina'],
};

const LO_QUE_DICE =
  'Hola, desde ayer en la tarde tengo un dolor en el pecho como un peso, yo diría que un 7 de 10, ' +
  'y me da cuando camino rápido. Peso 82 kilos y mido 1,62.';

async function vaciarFirestore(): Promise<void> {
  await fetchReal(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROYECTO}/databases/(default)/documents`,
    { method: 'DELETE' }
  );
}

type Participante = { uid: string; idToken: string; convId: string };

/** Una cuenta con perfil y una conversación con ficha: el camino caro, el que de verdad corre. */
async function prepararParticipante(): Promise<Participante> {
  const correo = `carga-${randomUUID()}@ejemplo.test`;
  const respuesta = await fetchReal(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=clave-falsa`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo, password: 'clave-del-emulador', returnSecureToken: true }),
    }
  );
  const datos: any = await respuesta.json();
  if (!datos.idToken) throw new Error(`El emulador de Auth no creó la cuenta: ${JSON.stringify(datos)}`);

  const uid: string = datos.localId;
  const db = getAdminDb();
  await db.doc(`Cuentas_Tutor/${uid}`).set({
    personalInfo: { sex: 'f', dateOfBirth: '1992-05-12' },
    createdAt: new Date('2026-09-01T10:00:00Z'),
  });
  const convId = 'c1';
  await db.doc(`Cuentas_Tutor/${uid}/conversaciones/${convId}`).set({
    status: 'active',
    memberId: ID_TITULAR,
    createdAt: new Date('2026-09-01T10:00:00Z'),
  });
  return { uid, idToken: datos.idToken, convId };
}

// ---------------------------------------------------------------------------
// Los tramos que el propio servidor ya cronometra (`registrarTiempos`).
// ---------------------------------------------------------------------------
type Tramos = Record<string, number[]>;
const tramos: Tramos = {};
let capturando = false;

const logReal = console.log.bind(console);
console.log = (...args: unknown[]) => {
  const linea = String(args[0] ?? '');
  if (capturando && linea.startsWith('[Dra. Hilda] Tiempos del turno:')) {
    for (const [, nombre, ms] of linea.matchAll(/([\wáéíóúñ+]+) (\d+) ms/g)) {
      (tramos[nombre!] ??= []).push(Number(ms));
    }
    return;
  }
  if (capturando) return; // el resto del ruido del servidor no interesa aquí
  logReal(...args);
};
const errorReal = console.error.bind(console);
const fallosDelServidor: string[] = [];
console.error = (...args: unknown[]) => {
  if (capturando) {
    fallosDelServidor.push(args.map(String).join(' ').slice(0, 200));
    return;
  }
  errorReal(...args);
};

// ---------------------------------------------------------------------------
// Estadística: percentiles sobre la muestra, sin interpolar.
// ---------------------------------------------------------------------------
function pct(valores: number[], p: number): number {
  if (valores.length === 0) return NaN;
  const ordenados = [...valores].sort((a, b) => a - b);
  const i = Math.min(ordenados.length - 1, Math.ceil((p / 100) * ordenados.length) - 1);
  return ordenados[Math.max(0, i)]!;
}
const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const n0 = (x: number) => (Number.isFinite(x) ? String(Math.round(x)) : '—');

type Resultado = {
  nivel: number;
  ok: number;
  fallidos: number;
  paredMs: number;
  latencias: number[];
  tramos: Tramos;
  rssPicoMiB: number;
  porSegundo: number;
};

/**
 * Un turno que no se cuenta. El primero de todos paga el arranque —compilar,
 * abrir la conexión con Firestore, armar el cliente de Admin— y medirlo
 * arruinaba el nivel de 1: salía 1.277 ms de "sesión" donde el resto de la
 * corrida gastaba 50.
 */
async function calentar(): Promise<void> {
  await vaciarFirestore();
  const p = await prepararParticipante();
  capturando = true;
  await enviarMensajeConsulta(p.idToken, p.convId, { texto: LO_QUE_DICE }, paciente);
  capturando = false;
}

async function medirNivel(nivel: number): Promise<Resultado> {
  await vaciarFirestore();
  const participantes: Participante[] = [];
  for (let i = 0; i < nivel; i += 1) participantes.push(await prepararParticipante());

  for (const nombre of Object.keys(tramos)) delete tramos[nombre];
  fallosDelServidor.length = 0;
  llamadasAHilda = 0;
  llamadasAlExtractor = 0;

  if (global.gc) global.gc();
  let rssPico = process.memoryUsage().rss;
  const vigilante = setInterval(() => {
    rssPico = Math.max(rssPico, process.memoryUsage().rss);
  }, 100);

  capturando = true;
  const latencias: number[] = [];
  let ok = 0;
  let fallidos = 0;
  const inicio = Date.now();

  await Promise.all(
    participantes.map(async (p) => {
      const t0 = Date.now();
      try {
        const r = await enviarMensajeConsulta(p.idToken, p.convId, { texto: LO_QUE_DICE }, paciente);
        if (r.success) ok += 1;
        else fallidos += 1;
      } catch {
        fallidos += 1;
      }
      latencias.push(Date.now() - t0);
    })
  );

  const paredMs = Date.now() - inicio;
  capturando = false;
  clearInterval(vigilante);

  return {
    nivel,
    ok,
    fallidos,
    paredMs,
    latencias,
    tramos: Object.fromEntries(Object.entries(tramos).map(([k, v]) => [k, [...v]])),
    rssPicoMiB: rssPico / 1024 / 1024,
    porSegundo: (ok / paredMs) * 1000,
  };
}

// ---------------------------------------------------------------------------
// Corrida
// ---------------------------------------------------------------------------
logReal('');
logReal('Turnos de teleorientación en paralelo, contra emuladores y con Gemini falso.');
logReal(`Demora simulada: Hilda ${DEMORA_HILDA_MS} ms, extractor ${DEMORA_EXTRACTOR_MS} ms.`);
logReal(`Piso teórico de un turno: ${PISO_IA_MS} ms (corren a la vez) + lo nuestro.`);
logReal(`Niveles: ${NIVELES.join(', ')}`);
logReal('');

await calentar();

const resultados: Resultado[] = [];
for (const nivel of NIVELES) {
  const r = await medirNivel(nivel);
  resultados.push(r);
  logReal(
    `  ${String(nivel).padStart(4)} a la vez  ->  ok ${r.ok}/${r.nivel}` +
      `  p50 ${n0(pct(r.latencias, 50))} ms  p95 ${n0(pct(r.latencias, 95))} ms  max ${n0(Math.max(...r.latencias))} ms` +
      `  pared ${n0(r.paredMs)} ms  ${r.porSegundo.toFixed(1)} turnos/s  RSS ${n0(r.rssPicoMiB)} MiB`
  );
  if (r.fallidos > 0) logReal(`        ${r.fallidos} turnos fallaron. Primer motivo: ${fallosDelServidor[0] ?? '(sin mensaje)'}`);
}

logReal('');
logReal('Lo nuestro, sin la demora del modelo (latencia observada − piso de IA):');
logReal('');
logReal('  nivel   p50     p95     max     sesión  guard+  histor  IA      turnos/s  RSS');
for (const r of resultados) {
  const propio = r.latencias.map((ms) => Math.max(0, ms - PISO_IA_MS));
  logReal(
    `  ${String(r.nivel).padStart(5)}  ` +
      `${n0(pct(propio, 50)).padStart(6)}  ${n0(pct(propio, 95)).padStart(6)}  ${n0(Math.max(...propio)).padStart(6)}  ` +
      `${n0(media(r.tramos['sesión'] ?? [])).padStart(6)}  ` +
      `${n0(media(r.tramos['guardar+permisos'] ?? [])).padStart(6)}  ` +
      `${n0(media(r.tramos['historial'] ?? [])).padStart(6)}  ` +
      `${n0(media(r.tramos['IA'] ?? [])).padStart(6)}  ` +
      `${r.porSegundo.toFixed(1).padStart(8)}  ${n0(r.rssPicoMiB).padStart(4)} MiB`
  );
}
logReal('');
logReal('Recordatorio: 512 MiB y 1 CPU por instancia, concurrency 80, maxInstances 4.');
logReal('Esta medición corre en un portátil con más de las dos cosas: es una cota optimista.');
logReal('');

process.exit(0);
