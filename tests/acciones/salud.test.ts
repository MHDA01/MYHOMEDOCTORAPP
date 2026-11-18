import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LATIDOS_POR_MINUTO, MARCA_REGISTRO, limitadorDeSalud, type Latido } from '@/lib/salud';

/**
 * El endpoint se prueba contra el emulador de Firestore, que es lo único que
 * toca. Para el caso de la base de datos caída se reemplaza `getAdminDb`, que
 * es la forma de provocar el fallo sin apagar el emulador a media suite.
 */
let falloForzado: Error | null = null;

vi.mock('@/lib/firebase-admin', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/firebase-admin')>();
  return {
    ...real,
    getAdminDb: () => {
      if (falloForzado) throw falloForzado;
      return real.getAdminDb();
    },
  };
});

const { GET } = await import('@/app/api/salud/route');

/** La dirección del balanceador, que es la que va siempre al final. */
const BALANCEADOR = '198.51.100.1';

/**
 * Un pedido como el que llega detrás del balanceador de Google: la IP del
 * cliente y, al final, la del propio balanceador.
 */
function pedido(ip = '203.0.113.7'): Request {
  return new Request('https://myhomedoctorapp.com/api/salud', {
    headers: { 'x-forwarded-for': `${ip}, ${BALANCEADOR}` },
  });
}

beforeEach(() => {
  // El contador es compartido por todo el proceso: sin esto, el orden de los
  // casos decidiría cuál de ellos recibe el 429.
  limitadorDeSalud.reiniciar();
});

afterEach(() => {
  falloForzado = null;
  limitadorDeSalud.reiniciar();
  vi.restoreAllMocks();
});

describe('El latido (/api/salud)', () => {
  it('con Firestore en pie, el chequeo de la base de datos pasa', async () => {
    // Aquí no se afirma el código de la respuesta: las pruebas corren con las
    // credenciales de producción borradas a propósito (`tests/preparacion.ts`),
    // así que el chequeo de claves falla por diseño. El paso de estado a código
    // está probado en `tests/unidad/salud.test.ts`.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const respuesta = await GET(pedido());
    const latido = (await respuesta.json()) as Latido;
    const firestore = latido.chequeos.find((c) => c.nombre === 'firestore')!;

    expect(firestore.ok).toBe(true);
    expect(firestore.esencial).toBe(true);
    expect(typeof latido.ms).toBe('number');
  });

  it('no se deja cachear', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const respuesta = await GET(pedido());
    expect(respuesta.headers.get('Cache-Control')).toBe('no-store');
  });

  it('si Firestore no responde, contesta 503', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    falloForzado = new Error('credencial vencida');

    const respuesta = await GET(pedido());
    const latido = (await respuesta.json()) as Latido;

    expect(respuesta.status).toBe(503);
    expect(latido.estado).toBe('caido');
    expect(latido.chequeos.find((c) => c.nombre === 'firestore')!.ok).toBe(false);
  });

  it('el fallo queda en el registro con la marca que se puede buscar', async () => {
    // Los registros de App Hosting llegan sin severity: esta marca es la única
    // forma de contar los fallos después.
    const registro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    falloForzado = new Error('credencial vencida');

    await GET(pedido());

    const lineas = registro.mock.calls.map((c) => String(c[0]));
    expect(lineas.some((l) => l.startsWith(MARCA_REGISTRO))).toBe(true);
    expect(lineas.some((l) => l.includes('chequeo=firestore'))).toBe(true);
  });

  it('la respuesta pública no cuenta por qué falló', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    falloForzado = new Error('PERMISSION_DENIED: el proyecto myhomedoctorapp rechazó la credencial');

    const respuesta = await GET(pedido());
    const cuerpo = JSON.stringify(await respuesta.json());

    expect(cuerpo).not.toContain('PERMISSION_DENIED');
    expect(cuerpo).not.toContain('myhomedoctorapp');
    expect(cuerpo).not.toContain('credencial');
  });

  it('solo informa de los chequeos previstos, sin datos de la app dentro', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const respuesta = await GET(pedido());
    const latido = (await respuesta.json()) as Latido;

    expect(latido.chequeos.map((c) => c.nombre).sort()).toEqual(['claves', 'claves-ia', 'firestore']);
    expect(Object.keys(latido).sort()).toEqual(['chequeos', 'estado', 'ms']);
  });
});

describe('El límite por IP', () => {
  // Estos casos miden el contador, no la base de datos, y hacen decenas de
  // peticiones. Con Firestore en pie cada una se iría a esperar su lectura; con
  // la base de datos forzada a fallar, la ruta contesta de inmediato y lo que
  // se observa es solo el límite. Que una petición cortada no llegue a leer
  // Firestore se ve igual: contesta 429 y no 503.
  beforeEach(() => {
    falloForzado = new Error('estos casos no necesitan la base de datos');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('pasado el máximo por minuto, la misma IP recibe 429', async () => {
    for (let i = 0; i < LATIDOS_POR_MINUTO; i += 1) {
      expect((await GET(pedido())).status).not.toBe(429);
    }

    const cortada = await GET(pedido());
    expect(cortada.status).toBe(429);
    expect(Number(cortada.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(cortada.headers.get('Cache-Control')).toBe('no-store');
  });

  it('una IP castigada no deja sin latido a las demás', async () => {
    for (let i = 0; i <= LATIDOS_POR_MINUTO; i += 1) await GET(pedido('203.0.113.7'));

    // Las regiones del chequeo de disponibilidad llegan con IPs distintas: si
    // una abusiva las arrastrara, el límite apagaría el monitoreo.
    const otra = await GET(pedido('203.0.113.9'));
    expect(otra.status).not.toBe(429);
  });

  it('el límite no se puede esquivar escribiendo la primera IP de la cadena', async () => {
    // El cliente manda una IP inventada distinta cada vez. La suya de verdad la
    // añade el balanceador en la penúltima posición, y es esa la que cuenta.
    const conIpInventada = (inventada: string) =>
      new Request('https://myhomedoctorapp.com/api/salud', {
        headers: { 'x-forwarded-for': `${inventada}, 203.0.113.7, ${BALANCEADOR}` },
      });

    for (let i = 0; i < LATIDOS_POR_MINUTO; i += 1) {
      expect((await GET(conIpInventada(`10.0.0.${i}`))).status).not.toBe(429);
    }

    expect((await GET(conIpInventada('10.0.0.250'))).status).toBe(429);
  });

  it('la dirección del balanceador no se usa como clave', async () => {
    // Si se usara la última entrada, todo el tráfico compartiría una cuenta: el
    // chequeo de disponibilidad se cortaría solo y cualquiera podría gastar la
    // cuota para dejar la app sin monitoreo. Dos clientes distintos detrás del
    // mismo balanceador tienen que poder latir los dos.
    for (let i = 0; i <= LATIDOS_POR_MINUTO; i += 1) await GET(pedido('203.0.113.7'));

    expect((await GET(pedido('203.0.113.8'))).status).not.toBe(429);
    expect((await GET(pedido('203.0.113.9'))).status).not.toBe(429);
  });

  it('la respuesta del 429 no dice cuál es el límite', async () => {
    for (let i = 0; i <= LATIDOS_POR_MINUTO; i += 1) await GET(pedido());
    const cortada = await GET(pedido());
    const cuerpo = JSON.stringify(await cortada.json());

    expect(cortada.status).toBe(429);
    expect(cuerpo).not.toContain(String(LATIDOS_POR_MINUTO));
  });

  it('una petición cortada no llega a mirar la base de datos', async () => {
    // La razón de ser del límite: que la avalancha no gaste lecturas. Con la
    // base de datos caída, una petición atendida contesta 503; que esta
    // contesta 429 significa que la ruta cortó antes de mirarla.
    for (let i = 0; i < LATIDOS_POR_MINUTO; i += 1) {
      expect((await GET(pedido())).status).toBe(503);
    }

    expect((await GET(pedido())).status).toBe(429);
  });
});
