// ============================================================
// app/actions/admin-protocolos.ts — Server Actions del agente de protocolos.
//
// El panel crea motivos, pide borradores (los genera functions/src/protocolos),
// guarda la decisión del médico sobre cada frase y publica solo lo aprobado.
// Nada de lo que está aquí llega a pacientes mientras la integración con la
// Dra. Hilda no se active.
// ============================================================
'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyAdminAccess } from '@/lib/admin-access';
import {
  COLECCION_PROTOCOLOS_BORRADORES,
  COLECCION_PROTOCOLOS_FUENTES,
  COLECCION_PROTOCOLOS_MOTIVOS,
  COLECCION_PROTOCOLOS_PUBLICADOS,
  CURSOS_DE_VIDA,
  ESTADOS_EN_PROCESO,
  MINUTOS_SIN_AVANCE,
  type BorradorProtocolo,
  type Decision,
  type EstadoBorrador,
  type FuenteProtocolo,
  type ItemProtocolo,
} from '@/lib/protocolos';

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

export interface ResumenBorrador {
  id: string;
  estado: EstadoBorrador;
  error: string | null;
  creado_en: string | null;
  actualizado_en: string | null;
  verificados: number;
  decididos: number;
  marcados: number;
  publicado_version: number | null;
}

export interface MotivoAdmin {
  id: string;
  motivo: string;
  curso_de_vida: string;
  edad: string;
  fuentes: string[];
  creado_en: string | null;
  borrador: ResumenBorrador | null;
  publicado: { version: number; en: string | null } | null;
}

/** Convierte Timestamps de Firestore en texto ISO para poder enviarlos al navegador. */
function aPlano(valor: unknown): unknown {
  if (valor instanceof Timestamp) return valor.toDate().toISOString();
  if (Array.isArray(valor)) return valor.map(aPlano);
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, aPlano(v)]));
  }
  return valor;
}

const iso = (v: unknown): string | null => (v instanceof Timestamp ? v.toDate().toISOString() : typeof v === 'string' ? v : null);

function enProceso(estado: string | undefined, actualizado: unknown): boolean {
  if (!estado || !ESTADOS_EN_PROCESO.includes(estado as EstadoBorrador)) return false;
  const ultima = actualizado instanceof Timestamp ? actualizado.toMillis() : 0;
  return Date.now() - ultima < MINUTOS_SIN_AVANCE * 60 * 1000;
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
}

async function fuentesDeLaBiblioteca(): Promise<FuenteProtocolo[]> {
  const snap = await getAdminDb().collection(COLECCION_PROTOCOLOS_FUENTES).get();
  return snap.docs
    .map((d) => ({
      id: d.id,
      titulo: d.get('titulo') ?? d.id,
      entidad: d.get('entidad') ?? null,
      anio: d.get('anio') ?? null,
      metodologia_calificacion: d.get('metodologia_calificacion') ?? null,
      url: d.get('url') ?? '',
      nota: d.get('nota') ?? null,
      inventario_total: d.get('inventario_total') ?? null,
      disponible: !!d.get('texto_sha256') && !!d.get('inventario_sha256') && (d.get('inventario_total') ?? 0) > 0,
    }))
    .sort((a, b) => Number(b.disponible) - Number(a.disponible) || a.titulo.localeCompare(b.titulo));
}

export async function listarProtocolosAdmin(
  idToken: string
): Promise<Resultado<{ fuentes: FuenteProtocolo[]; motivos: MotivoAdmin[] }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    const db = getAdminDb();
    const [fuentes, motivosSnap] = await Promise.all([
      fuentesDeLaBiblioteca(),
      db.collection(COLECCION_PROTOCOLOS_MOTIVOS).get(),
    ]);
    const idsBorrador = motivosSnap.docs.map((d) => d.get('borrador_actual')).filter((id): id is string => !!id);
    const borradores = idsBorrador.length
      ? await db.getAll(...idsBorrador.map((id) => db.collection(COLECCION_PROTOCOLOS_BORRADORES).doc(id)), {
          fieldMask: ['estado', 'error', 'creado_en', 'actualizado_en', 'metricas', 'items', 'revision', 'publicado_version'],
        })
      : [];
    const porId = new Map(borradores.filter((b) => b.exists).map((b) => [b.id, b]));

    const motivos: MotivoAdmin[] = motivosSnap.docs.map((d) => {
      const b = porId.get(d.get('borrador_actual'));
      let borrador: ResumenBorrador | null = null;
      if (b) {
        const items = (b.get('items') ?? []) as ItemProtocolo[];
        const verificados = items.filter((i) => i.verificacion?.estado === 'verificado');
        const revision = (b.get('revision') ?? {}) as Record<string, unknown>;
        borrador = {
          id: b.id,
          estado: b.get('estado'),
          error: b.get('error') ?? null,
          creado_en: iso(b.get('creado_en')),
          actualizado_en: iso(b.get('actualizado_en')),
          verificados: verificados.length,
          decididos: verificados.filter((i) => revision[i.id]).length,
          marcados: verificados.filter((i) => i.revisar_fidelidad).length,
          publicado_version: b.get('publicado_version') ?? null,
        };
      }
      const publicado = d.get('publicado');
      return {
        id: d.id,
        motivo: d.get('motivo'),
        curso_de_vida: d.get('curso_de_vida'),
        edad: d.get('edad'),
        fuentes: d.get('fuentes') ?? [],
        creado_en: iso(d.get('creado_en')),
        borrador,
        publicado: publicado ? { version: publicado.version, en: iso(publicado.en) } : null,
      };
    });
    motivos.sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''));
    return { success: true, data: { fuentes, motivos } };
  } catch (error) {
    console.error('[Protocolos] Error listando:', error);
    return { success: false, error: 'No se pudieron cargar los protocolos.' };
  }
}

export async function crearMotivoAdmin(
  idToken: string,
  entrada: { motivo: string; curso_de_vida: string; edad: string; fuentes: string[] }
): Promise<Resultado<{ id: string }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  const motivo = entrada.motivo?.trim() ?? '';
  const edad = entrada.edad?.trim() ?? '';
  if (motivo.length < 3 || motivo.length > 80) return { success: false, error: 'El motivo debe tener entre 3 y 80 caracteres.' };
  if (edad.length < 3 || edad.length > 60) return { success: false, error: 'Describe la edad (entre 3 y 60 caracteres).' };
  if (!CURSOS_DE_VIDA.some((c) => c.id === entrada.curso_de_vida)) return { success: false, error: 'Elige un curso de vida.' };

  try {
    const disponibles = new Set((await fuentesDeLaBiblioteca()).filter((f) => f.disponible).map((f) => f.id));
    const fuentes = [...new Set(entrada.fuentes ?? [])];
    if (!fuentes.length) return { success: false, error: 'Elige al menos una guía de la biblioteca.' };
    if (fuentes.some((f) => !disponibles.has(f))) return { success: false, error: 'Una de las guías elegidas no está disponible.' };

    const id = `${slug(motivo)}-${slug(entrada.curso_de_vida)}`;
    const ref = getAdminDb().collection(COLECCION_PROTOCOLOS_MOTIVOS).doc(id);
    await ref.create({
      motivo,
      curso_de_vida: entrada.curso_de_vida,
      edad,
      fuentes,
      creado_por: acceso.email,
      creado_en: FieldValue.serverTimestamp(),
      borrador_actual: null,
      publicado: null,
    });
    return { success: true, data: { id } };
  } catch (error) {
    if ((error as { code?: number }).code === 6) {
      return { success: false, error: 'Ya existe un motivo con ese nombre para ese curso de vida.' };
    }
    console.error('[Protocolos] Error creando motivo:', error);
    return { success: false, error: 'No se pudo crear el motivo.' };
  }
}

export async function generarBorradorAdmin(idToken: string, motivoId: string): Promise<Resultado<{ borradorId: string }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  const db = getAdminDb();
  try {
    const borradorId = await db.runTransaction(async (tx) => {
      const motivoRef = db.collection(COLECCION_PROTOCOLOS_MOTIVOS).doc(motivoId);
      const motivo = await tx.get(motivoRef);
      if (!motivo.exists) throw new Error('El motivo no existe.');
      const actual = motivo.get('borrador_actual');
      if (actual) {
        const previo = await tx.get(db.collection(COLECCION_PROTOCOLOS_BORRADORES).doc(actual));
        if (previo.exists && enProceso(previo.get('estado'), previo.get('actualizado_en'))) {
          throw new Error('Ya hay un borrador generándose para este motivo.');
        }
      }
      const nuevo = db.collection(COLECCION_PROTOCOLOS_BORRADORES).doc();
      tx.create(nuevo, {
        motivo_id: motivoId,
        motivo: {
          id: motivoId,
          motivo: motivo.get('motivo'),
          curso_de_vida: motivo.get('curso_de_vida'),
          edad: motivo.get('edad'),
          fuentes: motivo.get('fuentes'),
        },
        estado: 'en_cola',
        error: null,
        creado_por: acceso.email,
        creado_en: FieldValue.serverTimestamp(),
        actualizado_en: FieldValue.serverTimestamp(),
        revision: {},
      });
      tx.update(motivoRef, { borrador_actual: nuevo.id });
      return nuevo.id;
    });
    return { success: true, data: { borradorId } };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : '';
    if (mensaje.startsWith('Ya hay') || mensaje.startsWith('El motivo')) return { success: false, error: mensaje };
    console.error('[Protocolos] Error pidiendo borrador:', error);
    return { success: false, error: 'No se pudo iniciar la generación.' };
  }
}

export async function obtenerBorradorAdmin(
  idToken: string,
  borradorId: string
): Promise<Resultado<{ borrador: BorradorProtocolo; fuentes: FuenteProtocolo[] }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    const [snap, fuentes] = await Promise.all([
      getAdminDb().collection(COLECCION_PROTOCOLOS_BORRADORES).doc(borradorId).get(),
      fuentesDeLaBiblioteca(),
    ]);
    if (!snap.exists) return { success: false, error: 'Ese borrador no existe.' };
    const d = aPlano(snap.data()) as Record<string, unknown>;
    const borrador: BorradorProtocolo = {
      id: snap.id,
      motivo_id: d.motivo_id as string,
      motivo: d.motivo as BorradorProtocolo['motivo'],
      estado: d.estado as EstadoBorrador,
      error: (d.error as string) ?? null,
      importado: !!d.importado,
      creado_por: (d.creado_por as string) ?? null,
      creado_en: (d.creado_en as string) ?? null,
      actualizado_en: (d.actualizado_en as string) ?? null,
      terminado_en: (d.terminado_en as string) ?? null,
      generado: (d.generado as string) ?? null,
      modelo_redactor: (d.modelo_redactor as string) ?? null,
      modelo_juez: (d.modelo_juez as string) ?? null,
      uso_redactor: (d.uso_redactor as Record<string, unknown>) ?? null,
      uso_juez: (d.uso_juez as Record<string, unknown>) ?? null,
      metricas: (d.metricas as BorradorProtocolo['metricas']) ?? null,
      vacios: (d.vacios as string[]) ?? [],
      items: (d.items as ItemProtocolo[]) ?? [],
      excluidas: (d.excluidas as BorradorProtocolo['excluidas']) ?? [],
      sin_decision: (d.sin_decision as BorradorProtocolo['sin_decision']) ?? [],
      partes_no_usadas: (d.partes_no_usadas as BorradorProtocolo['partes_no_usadas']) ?? [],
      revision: (d.revision as BorradorProtocolo['revision']) ?? {},
      revision_actualizada_en: (d.revision_actualizada_en as string) ?? null,
      publicado_en: (d.publicado_en as string) ?? null,
      publicado_version: (d.publicado_version as number) ?? null,
    };
    return { success: true, data: { borrador, fuentes } };
  } catch (error) {
    console.error('[Protocolos] Error leyendo borrador:', error);
    return { success: false, error: 'No se pudo cargar el borrador.' };
  }
}

export async function decidirItemAdmin(
  idToken: string,
  borradorId: string,
  itemId: string,
  entrada: { decision: Decision | 'pendiente'; textoCorregido?: string; nota?: string }
): Promise<Resultado<null>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  const decisiones = ['aprobar', 'corregir', 'rechazar', 'pendiente'];
  if (!decisiones.includes(entrada.decision)) return { success: false, error: 'Decisión no válida.' };
  const textoCorregido = entrada.textoCorregido?.trim() ?? '';
  const nota = entrada.nota?.trim() ?? '';
  if (entrada.decision === 'corregir' && (textoCorregido.length < 5 || textoCorregido.length > 600)) {
    return { success: false, error: 'Escribe la frase corregida (entre 5 y 600 caracteres).' };
  }
  if (nota.length > 500) return { success: false, error: 'La nota no puede pasar de 500 caracteres.' };

  try {
    const ref = getAdminDb().collection(COLECCION_PROTOCOLOS_BORRADORES).doc(borradorId);
    const snap = await ref.get();
    if (!snap.exists || snap.get('estado') !== 'listo') return { success: false, error: 'El borrador no está listo para revisión.' };
    const item = ((snap.get('items') ?? []) as ItemProtocolo[]).find((i) => i.id === itemId);
    if (!item || item.verificacion?.estado !== 'verificado') return { success: false, error: 'Esa frase no existe o fue descartada.' };

    await ref.update({
      [`revision.${itemId}`]:
        entrada.decision === 'pendiente'
          ? FieldValue.delete()
          : {
              decision: entrada.decision,
              texto_corregido: entrada.decision === 'corregir' ? textoCorregido : null,
              nota: nota || null,
              por: acceso.email,
              en: FieldValue.serverTimestamp(),
            },
      revision_actualizada_en: FieldValue.serverTimestamp(),
    });
    return { success: true, data: null };
  } catch (error) {
    console.error('[Protocolos] Error guardando decisión:', error);
    return { success: false, error: 'No se pudo guardar la decisión.' };
  }
}

export async function publicarProtocoloAdmin(idToken: string, borradorId: string): Promise<Resultado<{ version: number }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  const db = getAdminDb();
  try {
    const version = await db.runTransaction(async (tx) => {
      const borradorRef = db.collection(COLECCION_PROTOCOLOS_BORRADORES).doc(borradorId);
      const borrador = await tx.get(borradorRef);
      if (!borrador.exists || borrador.get('estado') !== 'listo') throw new Error('El borrador no está listo.');
      const motivoId = borrador.get('motivo_id') as string;
      const motivoRef = db.collection(COLECCION_PROTOCOLOS_MOTIVOS).doc(motivoId);
      const publicadoRef = db.collection(COLECCION_PROTOCOLOS_PUBLICADOS).doc(motivoId);
      const [motivo, anterior] = await Promise.all([tx.get(motivoRef), tx.get(publicadoRef)]);
      if (!motivo.exists) throw new Error('El motivo ya no existe.');

      const revision = (borrador.get('revision') ?? {}) as Record<string, { decision: Decision; texto_corregido: string | null; nota: string | null; por: string }>;
      const verificados = ((borrador.get('items') ?? []) as ItemProtocolo[]).filter((i) => i.verificacion?.estado === 'verificado');
      const pendientes = verificados.filter((i) => !revision[i.id]);
      if (pendientes.length) throw new Error(`Faltan ${pendientes.length} frases por decidir.`);
      const aprobados = verificados.filter((i) => revision[i.id].decision !== 'rechazar');
      if (!aprobados.length) throw new Error('No hay frases aprobadas para publicar.');

      const nuevaVersion = ((anterior.exists ? anterior.get('version') : 0) as number) + 1;
      const contenido = {
        motivo_id: motivoId,
        motivo: borrador.get('motivo'),
        version: nuevaVersion,
        borrador_id: borradorId,
        publicado_por: acceso.email,
        publicado_en: FieldValue.serverTimestamp(),
        // La Dra. Hilda todavía no lee protocolos: activarlo es un paso aparte.
        en_uso_por_hilda: false,
        items: aprobados.map((i) => {
          const r = revision[i.id];
          return {
            id: i.id,
            seccion: i.seccion,
            texto: r.decision === 'corregir' && r.texto_corregido ? r.texto_corregido : i.texto,
            corregido_por_medico: r.decision === 'corregir',
            texto_propuesto: i.texto,
            nota_medico: r.nota ?? null,
            citas_literales: i.citas_literales,
            fuente: i.fuente,
            pagina: i.pagina ?? null,
            rec_id: i.rec_id,
            calificacion_literal: i.calificacion_literal,
            adaptacion: i.adaptacion ?? null,
          };
        }),
      };
      tx.set(publicadoRef, contenido);
      tx.set(publicadoRef.collection('versiones').doc(String(nuevaVersion)), contenido);
      tx.update(motivoRef, { publicado: { version: nuevaVersion, en: FieldValue.serverTimestamp(), borrador_id: borradorId } });
      tx.update(borradorRef, { publicado_en: FieldValue.serverTimestamp(), publicado_version: nuevaVersion });
      return nuevaVersion;
    });
    return { success: true, data: { version } };
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : '';
    if (/^(El borrador|El motivo|Faltan|No hay)/.test(mensaje)) return { success: false, error: mensaje };
    console.error('[Protocolos] Error publicando:', error);
    return { success: false, error: 'No se pudo publicar el protocolo.' };
  }
}
