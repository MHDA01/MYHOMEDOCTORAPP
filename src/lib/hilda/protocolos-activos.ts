import { getAdminDb } from '@/lib/firebase-admin';
import { COLECCION_PROTOCOLOS_FUENTES, COLECCION_PROTOCOLOS_PUBLICADOS } from '@/lib/protocolos';
import type { FraseProtocolo, ProtocoloActivo } from './tipos';

/**
 * Protocolos que la Dra. Hilda usa: los publicados que el médico activó
 * (en_uso_por_hilda). Publicar no basta; activar es un paso aparte en el panel.
 */

const DURACION_CACHE_MS = 5 * 60 * 1000;
let cache: { cargado: number; protocolos: ProtocoloActivo[] } | null = null;

/** Para pruebas y para el panel: la próxima lectura va a Firestore. */
export function olvidarProtocolosEnCache(): void {
  cache = null;
}

interface ItemPublicado {
  id: string;
  seccion: string | null;
  texto: string;
  fuente: string;
}

function nombreCorto(datos: FirebaseFirestore.DocumentData | undefined, id: string): string {
  if (!datos) return id;
  const entidad = String(datos.entidad ?? '').split(' - ')[0].trim();
  const anio = datos.anio ? ` ${datos.anio}` : '';
  return entidad ? `${entidad}${anio}` : String(datos.titulo ?? id);
}

export async function protocolosActivos(): Promise<ProtocoloActivo[]> {
  if (cache && Date.now() - cache.cargado < DURACION_CACHE_MS) return cache.protocolos;

  const db = getAdminDb();
  const snap = await db.collection(COLECCION_PROTOCOLOS_PUBLICADOS).where('en_uso_por_hilda', '==', true).get();
  const idsFuentes = new Set<string>();
  for (const d of snap.docs) for (const i of (d.get('items') ?? []) as ItemPublicado[]) if (i.fuente) idsFuentes.add(i.fuente);
  const fuentes = idsFuentes.size
    ? await db.getAll(...[...idsFuentes].map((id) => db.collection(COLECCION_PROTOCOLOS_FUENTES).doc(id)))
    : [];
  const nombresFuentes = Object.fromEntries(fuentes.map((f) => [f.id, nombreCorto(f.data(), f.id)]));

  const protocolos: ProtocoloActivo[] = snap.docs.map((d) => {
    const motivoId = d.id;
    const motivo = d.get('motivo') ?? {};
    const items = ((d.get('items') ?? []) as ItemPublicado[]).filter((i) => i?.id && i?.texto);
    const frases: FraseProtocolo[] = items.map((i) => ({ id: i.id, seccion: i.seccion ?? null, texto: i.texto, fuente: i.fuente }));
    return {
      motivoId,
      motivo: String(motivo.motivo ?? motivoId),
      edad: String(motivo.edad ?? ''),
      cursoDeVida: String(motivo.curso_de_vida ?? ''),
      version: Number(d.get('version') ?? 0),
      signos: items
        .filter((i) => i.seccion === 'signos_de_alarma')
        .map((i) => ({ id: `${motivoId}:${i.id}`, texto: i.texto, origen: 'protocolo' as const, fuente: i.fuente })),
      preguntas: items.filter((i) => i.seccion === 'preguntas_triage').map((i) => ({ id: `${motivoId}:${i.id}`, texto: i.texto })),
      frases,
      nombresFuentes,
    };
  });

  cache = { cargado: Date.now(), protocolos };
  return protocolos;
}
