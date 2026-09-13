// ============================================================
// app/actions/admin-seguimiento.ts — Server Actions del panel de administración:
// cifras de uso y lista de cuentas.
//
// Solo cuenta y fechas: nunca lee ni descifra el contenido de las consultas.
// ============================================================
'use server';

import type { UserRecord } from 'firebase-admin/auth';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { verifyAdminAccess } from '@/lib/admin-access';
import { COLECCION_TUTOR, SUBCOLECCION_CONVERSACIONES, SUBCOLECCION_INTEGRANTES } from '@/lib/constants';

const DIA_MS = 24 * 60 * 60 * 1000;
const SEMANAS_EN_GRAFICA = 12;
// Decisión del 13-sep-2026: la app es gratis hasta 1.000 usuarios (src/config/acceso.ts).
const META_USUARIOS = 1000;

export interface SemanaAdmin {
  /** Lunes de la semana, AAAA-MM-DD (hora de Bogotá). */
  inicio: string;
  registros: number;
  consultas: number;
}

export interface ResumenAdmin {
  generadoEn: string;
  meta: number;
  cuentas: { total: number; nuevas7: number; nuevas30: number; activas7: number; activas30: number };
  consultas: { total: number; iniciadas7: number; iniciadas30: number; conActividad7: number; mensajesPromedio: number | null; cuentasQueConsultaron: number };
  familia: { integrantes: number; cuentasConFamilia: number };
  informes: number;
  notificaciones: number;
  consejosHoy: { generados: number; enviados: number };
  semanas: SemanaAdmin[];
}

export interface UsuarioAdmin {
  uid: string;
  email: string | null;
  nombre: string | null;
  acceso: string;
  registrado: string;
  ultimoUso: string | null;
  deshabilitado: boolean;
  consultas: number;
  ultimaConsulta: string | null;
  integrantes: number;
  notificaciones: boolean;
}

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

// Bogotá no tiene horario de verano: UTC-5 todo el año.
const OFFSET_BOGOTA_MS = 5 * 60 * 60 * 1000;
function diaBogota(ms: number): string {
  return new Date(ms - OFFSET_BOGOTA_MS).toISOString().slice(0, 10);
}
function lunesBogota(ms: number): string {
  const local = new Date(ms - OFFSET_BOGOTA_MS);
  const desdeLunes = (local.getUTCDay() + 6) % 7;
  return new Date(local.getTime() - desdeLunes * DIA_MS).toISOString().slice(0, 10);
}

async function todasLasCuentas(): Promise<UserRecord[]> {
  const cuentas: UserRecord[] = [];
  let pageToken: string | undefined;
  do {
    const pagina = await getAdminAuth().listUsers(1000, pageToken);
    cuentas.push(...pagina.users);
    pageToken = pagina.pageToken;
  } while (pageToken);
  // Las sesiones anónimas (sin proveedor) no son personas registradas.
  return cuentas.filter((u) => u.providerData.length > 0);
}

function ultimoUsoMs(u: UserRecord): number | null {
  const fechas = [u.metadata.lastRefreshTime, u.metadata.lastSignInTime]
    .filter(Boolean)
    .map((f) => new Date(f as string).getTime())
    .filter((n) => !Number.isNaN(n));
  return fechas.length ? Math.max(...fechas) : null;
}

/** Dueño (uid) de un documento de Cuentas_Tutor/{uid}/..., o null si es de otra colección. */
function duenoDe(ref: FirebaseFirestore.DocumentReference): string | null {
  const cuenta = ref.parent.parent;
  return cuenta && cuenta.parent.id === COLECCION_TUTOR ? cuenta.id : null;
}

interface ConsultaResumida { uid: string; iniciada: number; actividad: number; mensajes: number }

async function consultasConMensajes(): Promise<ConsultaResumida[]> {
  // createTime es la fecha real de creación: el campo createdAt se reescribe con
  // cada mensaje (persistConversationMessage) y no sirve para contar inicios.
  const snap = await getAdminDb().collectionGroup(SUBCOLECCION_CONVERSACIONES).select('messageCount', 'updatedAt').get();
  const salida: ConsultaResumida[] = [];
  for (const doc of snap.docs) {
    const uid = duenoDe(doc.ref);
    const mensajes = Number(doc.get('messageCount') ?? 0);
    if (!uid || mensajes <= 0) continue;
    const iniciada = doc.createTime.toMillis();
    const actividad = doc.get('updatedAt')?.toMillis?.() ?? iniciada;
    salida.push({ uid, iniciada, actividad, mensajes });
  }
  return salida;
}

async function integrantesPorCuenta(): Promise<Map<string, number>> {
  const snap = await getAdminDb().collectionGroup(SUBCOLECCION_INTEGRANTES).select('esTitular').get();
  const conteo = new Map<string, number>();
  for (const doc of snap.docs) {
    const uid = duenoDe(doc.ref);
    if (!uid || doc.id === 'titular' || doc.get('esTitular') === true) continue;
    conteo.set(uid, (conteo.get(uid) ?? 0) + 1);
  }
  return conteo;
}

async function cuentasConNotificaciones(): Promise<Set<string>> {
  const snap = await getAdminDb().collection(COLECCION_TUTOR).select('notificationToken').get();
  return new Set(snap.docs.filter((d) => !!d.get('notificationToken')).map((d) => d.id));
}

export async function obtenerResumenAdmin(idToken: string): Promise<Resultado<ResumenAdmin>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    const db = getAdminDb();
    const ahora = Date.now();
    const [cuentas, consultas, integrantes, notificaciones, informes, consejos] = await Promise.all([
      todasLasCuentas(),
      consultasConMensajes(),
      integrantesPorCuenta(),
      cuentasConNotificaciones(),
      db.collectionGroup('reports').select().get(),
      db.collectionGroup('dailyTips').where('date', '==', diaBogota(ahora)).select('pushSent').get(),
    ]);

    const hace = (dias: number) => ahora - dias * DIA_MS;
    const registro = (u: UserRecord) => new Date(u.metadata.creationTime).getTime();

    // Semanas de la gráfica, de la más antigua a la actual.
    const semanas: SemanaAdmin[] = [];
    const indice = new Map<string, SemanaAdmin>();
    for (let i = SEMANAS_EN_GRAFICA - 1; i >= 0; i--) {
      const inicio = lunesBogota(ahora - i * 7 * DIA_MS);
      if (indice.has(inicio)) continue;
      const semana = { inicio, registros: 0, consultas: 0 };
      semanas.push(semana);
      indice.set(inicio, semana);
    }
    for (const u of cuentas) {
      const semana = indice.get(lunesBogota(registro(u)));
      if (semana) semana.registros++;
    }
    for (const c of consultas) {
      const semana = indice.get(lunesBogota(c.iniciada));
      if (semana) semana.consultas++;
    }

    const totalMensajes = consultas.reduce((suma, c) => suma + c.mensajes, 0);
    return {
      success: true,
      data: {
        generadoEn: new Date(ahora).toISOString(),
        meta: META_USUARIOS,
        cuentas: {
          total: cuentas.length,
          nuevas7: cuentas.filter((u) => registro(u) >= hace(7)).length,
          nuevas30: cuentas.filter((u) => registro(u) >= hace(30)).length,
          activas7: cuentas.filter((u) => (ultimoUsoMs(u) ?? 0) >= hace(7)).length,
          activas30: cuentas.filter((u) => (ultimoUsoMs(u) ?? 0) >= hace(30)).length,
        },
        consultas: {
          total: consultas.length,
          iniciadas7: consultas.filter((c) => c.iniciada >= hace(7)).length,
          iniciadas30: consultas.filter((c) => c.iniciada >= hace(30)).length,
          conActividad7: consultas.filter((c) => c.actividad >= hace(7)).length,
          mensajesPromedio: consultas.length ? Math.round((totalMensajes / consultas.length) * 10) / 10 : null,
          cuentasQueConsultaron: new Set(consultas.map((c) => c.uid)).size,
        },
        familia: {
          integrantes: [...integrantes.values()].reduce((a, b) => a + b, 0),
          cuentasConFamilia: integrantes.size,
        },
        informes: informes.docs.filter((d) => duenoDe(d.ref)).length,
        notificaciones: notificaciones.size,
        consejosHoy: {
          generados: consejos.docs.filter((d) => duenoDe(d.ref)).length,
          enviados: consejos.docs.filter((d) => duenoDe(d.ref) && d.get('pushSent') === true).length,
        },
        semanas,
      },
    };
  } catch (error) {
    console.error('[Admin] Error calculando el resumen:', error);
    return { success: false, error: 'No se pudo calcular el resumen.' };
  }
}

export async function listarUsuariosAdmin(idToken: string): Promise<Resultado<UsuarioAdmin[]>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    const [cuentas, consultas, integrantes, notificaciones, perfiles] = await Promise.all([
      todasLasCuentas(),
      consultasConMensajes(),
      integrantesPorCuenta(),
      cuentasConNotificaciones(),
      getAdminDb().collection(COLECCION_TUTOR).select('personalInfo.firstName', 'personalInfo.lastName').get(),
    ]);

    const nombres = new Map<string, string>();
    for (const doc of perfiles.docs) {
      const nombre = [doc.get('personalInfo.firstName'), doc.get('personalInfo.lastName')].filter(Boolean).join(' ').trim();
      if (nombre) nombres.set(doc.id, nombre);
    }
    const porCuenta = new Map<string, { total: number; ultima: number }>();
    for (const c of consultas) {
      const actual = porCuenta.get(c.uid) ?? { total: 0, ultima: 0 };
      actual.total++;
      actual.ultima = Math.max(actual.ultima, c.actividad);
      porCuenta.set(c.uid, actual);
    }

    const PROVEEDORES: Record<string, string> = { password: 'Correo', 'google.com': 'Google', phone: 'Teléfono', 'apple.com': 'Apple' };
    const usuarios: UsuarioAdmin[] = cuentas.map((u) => {
      const uso = ultimoUsoMs(u);
      const c = porCuenta.get(u.uid);
      return {
        uid: u.uid,
        email: u.email ?? null,
        nombre: nombres.get(u.uid) ?? u.displayName ?? null,
        acceso: u.providerData.map((p) => PROVEEDORES[p.providerId] ?? p.providerId).join(', '),
        registrado: new Date(u.metadata.creationTime).toISOString(),
        ultimoUso: uso ? new Date(uso).toISOString() : null,
        deshabilitado: u.disabled,
        consultas: c?.total ?? 0,
        ultimaConsulta: c ? new Date(c.ultima).toISOString() : null,
        integrantes: integrantes.get(u.uid) ?? 0,
        notificaciones: notificaciones.has(u.uid),
      };
    });
    usuarios.sort((a, b) => b.registrado.localeCompare(a.registrado));
    return { success: true, data: usuarios };
  } catch (error) {
    console.error('[Admin] Error listando usuarios:', error);
    return { success: false, error: 'No se pudo cargar la lista de usuarios.' };
  }
}
