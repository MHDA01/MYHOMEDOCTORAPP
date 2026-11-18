/**
 * `GET /api/salud` — el latido que una máquina puede preguntar cada cinco
 * minutos. Las razones de cada decisión están en `src/lib/salud.ts`; aquí solo
 * se conectan los chequeos con Firestore y con el registro del servidor.
 *
 * No lleva autenticación a propósito: un chequeo de disponibilidad de Cloud
 * Monitoring no sabe iniciar sesión. De ahí las tres precauciones: la respuesta
 * no cuenta nada —ni mensajes de error, ni nombre de proyecto, ni versiones—,
 * lo único que hace contra la base de datos es leer un documento que no
 * contiene nada, y hay un límite de peticiones por IP para que la ruta no sea
 * una manija para gastar lecturas ajenas.
 */

import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firebase-admin';
import { cuantasReenviadas, ipDelPedido } from '@/lib/limite-peticiones';
import {
  MARCA_REGISTRO,
  chequearClaves,
  chequearConLimite,
  codigoHttp,
  limitadorDeSalud,
  resumirEstado,
  type Latido,
} from '@/lib/salud';

// Sin esto, `next build` intentaría precalcular la ruta y hablar con Firestore
// durante la compilación.
export const dynamic = 'force-dynamic';

/**
 * El documento que se lee para probar que Firestore contesta.
 *
 * No necesita existir: lo que se comprueba es que la credencial sirve y que la
 * base de datos responde, y una lectura en vacío ya lo demuestra. Está fuera de
 * los datos de los pacientes para que el latido no pueda tocar nada clínico, ni
 * por error ni si alguien cambia estas líneas sin leer este comentario.
 */
const DOCUMENTO_LATIDO = '_salud/latido';

/** El detalle del fallo va al registro, nunca a la respuesta. */
function registrarFallo(nombre: string, motivo: unknown): void {
  const texto = motivo instanceof Error ? motivo.message : String(motivo);
  console.error(`${MARCA_REGISTRO} chequeo=${nombre} motivo=${texto}`);
}

/**
 * Cuántas entradas trae `x-forwarded-for` cuando no son las dos previstas.
 *
 * El límite por IP se apoya en la penúltima entrada, y eso solo es correcto si
 * el balanceador añade exactamente dos. La documentación de Google no es
 * explícita para App Hosting, así que en vez de confiar en la suposición, la
 * ruta deja constancia de la forma real la primera vez que no coincide: basta
 * buscar esta marca en los registros para saber si hay que ajustar
 * `ipDelPedido`. Se registra **el número de entradas, nunca las direcciones**:
 * una IP es un dato personal (Ley 1581) y aquí no hace falta ninguna.
 *
 * Una sola vez por instancia: si la forma fuera distinta, cada latido escribiría
 * una línea y en un día habría miles iguales.
 */
let formaAvisada = false;

function vigilarFormaDeLaCadena(cabeceras: Headers): void {
  if (formaAvisada) return;
  const entradas = cuantasReenviadas(cabeceras);
  if (entradas === 2) {
    formaAvisada = true;
    return;
  }
  formaAvisada = true;
  console.error(`${MARCA_REGISTRO} x-forwarded-for entradas=${entradas} (previstas 2)`);
}

export async function GET(pedido: Request) {
  const inicio = Date.now();

  // El límite va antes de cualquier otra cosa: la idea es que una avalancha no
  // llegue a gastar lecturas de Firestore. La respuesta no dice cuál es el
  // límite ni cuántas quedan —eso solo le serviría a quien lo esté midiendo—,
  // solo cuánto esperar.
  vigilarFormaDeLaCadena(pedido.headers);
  const permiso = limitadorDeSalud.permitir(ipDelPedido(pedido.headers));
  if (!permiso.ok) {
    return NextResponse.json(
      { error: 'Demasiadas peticiones' },
      {
        status: 429,
        headers: {
          'Retry-After': String(Math.ceil(permiso.esperaMs / 1000)),
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  const firestore = await chequearConLimite(
    'firestore',
    true,
    () => getAdminDb().doc(DOCUMENTO_LATIDO).get(),
    { alFallar: registrarFallo }
  );

  const chequeos = [firestore, ...chequearClaves(process.env)];
  for (const chequeo of chequeos) {
    if (!chequeo.ok && chequeo.nombre !== 'firestore') {
      registrarFallo(chequeo.nombre, 'falta configuración');
    }
  }

  const estado = resumirEstado(chequeos);
  const latido: Latido = { estado, ms: Date.now() - inicio, chequeos };

  if (estado !== 'ok') {
    console.error(`${MARCA_REGISTRO} estado=${estado} ms=${latido.ms}`);
  }

  return NextResponse.json(latido, {
    status: codigoHttp(estado),
    // Un latido en caché es un latido que miente.
    headers: { 'Cache-Control': 'no-store' },
  });
}
