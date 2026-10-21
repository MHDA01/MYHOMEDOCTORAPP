// ============================================================
// app/actions/admin-consultas.ts — La bandeja del médico.
//
// Hasta aquí el panel solo contaba consultas y nunca miraba dentro
// (admin-seguimiento.ts lo dice en su encabezado). Esto cruza esa línea a
// propósito: el médico fundador necesita leer la consulta para decidir. Por eso
// todo lo que se abre queda registrado en COLECCION_AUDITORIA, con nombre y
// hora, y el paciente debe saberlo (aviso de privacidad, pendiente de texto).
//
// Nada de esto es accesible desde el navegador por reglas: el resumen vive en
// una subcolección que ninguna regla alcanza y la auditoría está cerrada a
// todos. La única puerta es verifyAdminAccess, aquí, en el servidor.
// ============================================================
'use server';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { verifyAdminAccess } from '@/lib/admin-access';
import { decryptField, encryptField } from '@/lib/crypto';
import { DEFAULT_GEMINI_MODEL, generateWithGemini } from '@/lib/gemini';
import {
  COLECCION_AUDITORIA,
  COLECCION_TUTOR,
  DOC_HISTORIAL,
  DOC_RESUMEN_MEDICO,
  SUBCOLECCION_CONVERSACIONES,
  SUBCOLECCION_HISTORIAL,
  SUBCOLECCION_INTEGRANTES,
  SUBCOLECCION_RESUMEN,
} from '@/lib/constants';
import {
  ESQUEMA_GEMINI_RESUMEN,
  PROMPT_RESUMEN,
  VERSION_RESUMEN,
  entradaParaElModelo,
  gravedad,
  resumenDesdeModelo,
  type NivelAtencion,
  type ResumenConsulta,
} from '@/lib/resumen-consulta';
import {
  ID_TITULAR,
  esTitularGuardado,
  pacienteDeIntegrante,
  pacienteDeTitular,
  type PacienteDeConsulta,
} from '@/lib/paciente-de-consulta';

type Resultado<T> = { success: true; data: T } | { success: false; error: string };

/** Consultas más viejas que esto no entran en la bandeja. */
const DIAS_EN_LA_BANDEJA = 30;
const DIA_MS = 24 * 60 * 60 * 1000;
/** El resumen cuesta una llamada al modelo: se recorta lo muy largo. */
const MAX_MENSAJES_A_RESUMIR = 60;
const TIEMPO_LIMITE_MS = 90_000;

export interface ConsultaEnCola {
  uid: string;
  convId: string;
  /** Nombre de la persona por la que se consultó, como lo guardó la app. */
  paciente: string;
  iniciada: string;
  ultimaActividad: string;
  mensajes: number;
  /** null mientras nadie haya pedido el resumen de esa consulta. */
  nivel: NivelAtencion | null;
  banderas: number;
  revisadaPor: string | null;
  revisadaEn: string | null;
}

export interface ConsultaAbierta {
  uid: string;
  convId: string;
  paciente: PacienteDeConsulta;
  resumen: ResumenConsulta;
  generadoEn: string;
  modelo: string;
  /** Mensajes que alcanzó a ver el resumen; si la consulta siguió, se ve aquí. */
  mensajesResumidos: number;
  mensajesAhora: number;
  revisadaPor: string | null;
  revisadaEn: string | null;
  nota: string;
}

export interface MensajeTranscrito {
  quien: 'paciente' | 'hilda';
  texto: string;
  en: string;
}

// ─────────────────────────────────────────────────────────────
// Rutas y auditoría
// ─────────────────────────────────────────────────────────────

function conversacionRef(uid: string, convId: string) {
  return getAdminDb().collection(COLECCION_TUTOR).doc(uid).collection(SUBCOLECCION_CONVERSACIONES).doc(convId);
}

function resumenRef(uid: string, convId: string) {
  return conversacionRef(uid, convId).collection(SUBCOLECCION_RESUMEN).doc(DOC_RESUMEN_MEDICO);
}

/** uid dueño de un documento `Cuentas_Tutor/{uid}/conversaciones/{convId}`. */
function duenoDeConversacion(ref: FirebaseFirestore.DocumentReference): string | null {
  const cuenta = ref.parent.parent;
  return cuenta && cuenta.parent.id === COLECCION_TUTOR ? cuenta.id : null;
}

/**
 * Deja constancia de que un médico abrió datos de un paciente. Nunca guarda el
 * contenido, solo quién, qué y cuándo: el registro de un acceso no debe ser una
 * segunda copia de la historia clínica.
 *
 * Si falla, la lectura continúa: no se le niega al médico el acceso a una
 * consulta porque el registro no se pudo escribir, pero queda en los logs.
 */
async function registrarAcceso(
  medico: string,
  accion: 'resumen' | 'resumen_regenerado' | 'transcripcion' | 'revision',
  uid: string,
  convId: string
): Promise<void> {
  try {
    await getAdminDb().collection(COLECCION_AUDITORIA).add({
      medico,
      accion,
      uid,
      convId,
      en: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error('[Admin] No se pudo registrar el acceso a una consulta:', error);
  }
}

function enTexto(valor: unknown): string | null {
  const fecha = (valor as Timestamp | undefined)?.toDate?.();
  return fecha ? fecha.toISOString() : null;
}

// ─────────────────────────────────────────────────────────────
// La bandeja
// ─────────────────────────────────────────────────────────────

/**
 * Las consultas de los últimos 30 días, las más graves primero y, dentro de
 * cada nivel, las más recientes.
 *
 * Recorre el grupo de colecciones y ordena en memoria, igual que
 * admin-seguimiento.ts: ordenar en Firestore pediría un índice de grupo sobre
 * `updatedAt`, y desplegar índices en este proyecto es una decisión aparte
 * (ver las trampas de ESTADO.md). Con el tamaño de hoy sobra; el día que haya
 * miles de consultas al mes habrá que paginar de verdad.
 */
export async function listarConsultasAdmin(idToken: string): Promise<Resultado<ConsultaEnCola[]>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };

  try {
    const db = getAdminDb();
    const desde = Date.now() - DIAS_EN_LA_BANDEJA * DIA_MS;

    const [conversaciones, resumenes] = await Promise.all([
      db.collectionGroup(SUBCOLECCION_CONVERSACIONES).select('memberName', 'messageCount', 'updatedAt').get(),
      // Solo la cabecera: `datos` (el resumen cifrado) no viaja a la bandeja.
      db.collectionGroup(SUBCOLECCION_RESUMEN).select('nivel', 'banderas', 'revisadaPor', 'revisadaEn').get(),
    ]);

    const porConversacion = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    for (const doc of resumenes.docs) {
      const conversacion = doc.ref.parent.parent;
      if (doc.id === DOC_RESUMEN_MEDICO && conversacion) porConversacion.set(conversacion.path, doc);
    }

    const cola: ConsultaEnCola[] = [];
    for (const doc of conversaciones.docs) {
      const uid = duenoDeConversacion(doc.ref);
      const mensajes = Number(doc.get('messageCount') ?? 0);
      if (!uid || mensajes <= 0) continue;

      const iniciada = doc.createTime.toMillis();
      const actividad = enTexto(doc.get('updatedAt')) ?? new Date(iniciada).toISOString();
      if (new Date(actividad).getTime() < desde) continue;

      const resumen = porConversacion.get(doc.ref.path);
      cola.push({
        uid,
        convId: doc.id,
        paciente: String(doc.get('memberName') ?? '').trim() || 'Sin nombre',
        iniciada: new Date(iniciada).toISOString(),
        ultimaActividad: actividad,
        mensajes,
        nivel: (resumen?.get('nivel') as NivelAtencion | undefined) ?? null,
        banderas: Number(resumen?.get('banderas') ?? 0),
        revisadaPor: (resumen?.get('revisadaPor') as string | undefined) ?? null,
        revisadaEn: enTexto(resumen?.get('revisadaEn')),
      });
    }

    // Sin resumen todavía no se sabe la gravedad: va después de las urgentes y
    // antes de las ya clasificadas como leves, para que no se escondan.
    const orden = (c: ConsultaEnCola) => (c.nivel ? gravedad(c.nivel) : 1.5);
    cola.sort((a, b) => orden(b) - orden(a) || b.ultimaActividad.localeCompare(a.ultimaActividad));

    return { success: true, data: cola };
  } catch (error) {
    console.error('[Admin] Error armando la bandeja de consultas:', error);
    return { success: false, error: 'No se pudo cargar la bandeja de consultas.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Leer una consulta
// ─────────────────────────────────────────────────────────────

/** Ficha de la persona por la que se consultó. */
async function pacienteDeLaConsulta(uid: string, memberId: string | undefined): Promise<PacienteDeConsulta> {
  const db = getAdminDb();
  const cuentaRef = db.collection(COLECCION_TUTOR).doc(uid);
  const vacio: PacienteDeConsulta = { nombre: '', alergias: [], medicamentos: [], antecedentes: [] };

  if (!memberId || memberId === ID_TITULAR) {
    const cuenta = await cuentaRef.get();
    return cuenta.exists ? pacienteDeTitular(cuenta.data()) : vacio;
  }

  const integranteRef = cuentaRef.collection(SUBCOLECCION_INTEGRANTES).doc(memberId);
  const [integrante, historial] = await Promise.all([
    integranteRef.get(),
    integranteRef.collection(SUBCOLECCION_HISTORIAL).doc(DOC_HISTORIAL).get(),
  ]);

  if (!integrante.exists) {
    // El integrante se borró después de la consulta; queda el titular como ficha.
    const cuenta = await cuentaRef.get();
    return cuenta.exists ? pacienteDeTitular(cuenta.data()) : vacio;
  }
  // Un documento antiguo del titular dentro de Integrantes no trae su salud.
  if (esTitularGuardado(integrante.data())) {
    const cuenta = await cuentaRef.get();
    if (cuenta.exists) return pacienteDeTitular(cuenta.data());
  }
  return pacienteDeIntegrante(integrante.data(), historial.exists ? historial.data() : null);
}

/** Mensajes de la consulta, descifrados y sin los textos que escribe la app. */
async function transcripcion(uid: string, convId: string): Promise<MensajeTranscrito[]> {
  const snap = await conversacionRef(uid, convId).collection('mensajes').orderBy('timestamp', 'asc').get();
  const salida: MensajeTranscrito[] = [];
  for (const doc of snap.docs) {
    const datos = doc.data();
    if (datos.origen === 'sistema') continue;
    const texto = (datos.isEncrypted ? decryptField(datos.content) : datos.content) ?? '';
    if (!String(texto).trim()) continue;
    salida.push({
      quien: datos.role === 'user' ? 'paciente' : 'hilda',
      texto: String(texto),
      en: enTexto(datos.timestamp) ?? new Date(0).toISOString(),
    });
  }
  return salida;
}

async function generarResumen(
  paciente: PacienteDeConsulta,
  mensajes: MensajeTranscrito[]
): Promise<{ resumen: ResumenConsulta; modelo: string } | { error: string }> {
  // Si la consulta es larga se conservan los últimos turnos: el motivo suele
  // estar al principio, pero lo que decide la conducta es cómo terminó.
  const recortada = mensajes.slice(-MAX_MENSAJES_A_RESUMIR);
  const modelo = process.env.TELEORIENTACION_MODEL || DEFAULT_GEMINI_MODEL;

  const respuesta = await generateWithGemini({
    system: PROMPT_RESUMEN,
    contents: [{ role: 'user', parts: [{ text: entradaParaElModelo(paciente, recortada) }] }],
    model: modelo,
    temperature: 0.1,
    maxTokens: 2048,
    responseSchema: ESQUEMA_GEMINI_RESUMEN,
    timeoutMs: TIEMPO_LIMITE_MS,
    reintentos: 2,
  });

  if (!respuesta.ok) {
    console.error('[Admin] El modelo no devolvió el resumen:', respuesta.kind, respuesta.detail);
    return { error: 'El modelo no pudo resumir la consulta. Vuelve a intentarlo.' };
  }

  let bruto: unknown;
  try {
    bruto = JSON.parse(respuesta.text);
  } catch {
    console.error('[Admin] El resumen no vino en JSON:', respuesta.text.slice(0, 300));
    return { error: 'El modelo devolvió algo que no se pudo leer. Vuelve a intentarlo.' };
  }

  const resumen = resumenDesdeModelo(bruto);
  if (!resumen) return { error: 'El resumen llegó incompleto. Vuelve a intentarlo.' };
  return { resumen, modelo };
}

/**
 * Abre una consulta: devuelve el resumen guardado o, si no hay (o si se pide
 * `forzar`), lo genera y lo guarda cifrado.
 *
 * El resumen se guarda y no se regenera en cada visita por tres razones: cuesta
 * una llamada al modelo, dos corridas del mismo chat no dan exactamente el mismo
 * texto, y el médico tiene que poder volver a ver lo que leyó cuando decidió.
 */
export async function abrirConsultaAdmin(
  idToken: string,
  uid: string,
  convId: string,
  forzar = false
): Promise<Resultado<ConsultaAbierta>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };
  if (!uid.trim() || !convId.trim() || convId.includes('/')) {
    return { success: false, error: 'Falta la consulta que se va a abrir.' };
  }

  try {
    const conversacion = await conversacionRef(uid, convId).get();
    if (!conversacion.exists) return { success: false, error: 'Esa consulta ya no existe.' };

    const mensajesAhora = Number(conversacion.get('messageCount') ?? 0);
    const paciente = await pacienteDeLaConsulta(uid, conversacion.get('memberId'));
    const guardado = await resumenRef(uid, convId).get();

    const sirveElGuardado =
      !forzar && guardado.exists && Number(guardado.get('version') ?? 0) === VERSION_RESUMEN;

    if (sirveElGuardado) {
      await registrarAcceso(acceso.email, 'resumen', uid, convId);
      const nota = guardado.get('nota');
      return {
        success: true,
        data: {
          uid,
          convId,
          paciente,
          resumen: JSON.parse(decryptField(guardado.get('datos'))) as ResumenConsulta,
          generadoEn: enTexto(guardado.get('generadoEn')) ?? new Date().toISOString(),
          modelo: String(guardado.get('modelo') ?? ''),
          mensajesResumidos: Number(guardado.get('mensajes') ?? 0),
          mensajesAhora,
          revisadaPor: (guardado.get('revisadaPor') as string | undefined) ?? null,
          revisadaEn: enTexto(guardado.get('revisadaEn')),
          nota: nota ? decryptField(nota) : '',
        },
      };
    }

    const mensajes = await transcripcion(uid, convId);
    if (!mensajes.some((m) => m.quien === 'paciente')) {
      return { success: false, error: 'En esta consulta el paciente no alcanzó a escribir nada.' };
    }

    const generado = await generarResumen(paciente, mensajes);
    if ('error' in generado) return { success: false, error: generado.error };

    const ahora = Timestamp.now();
    // Nivel y número de banderas quedan en claro: son lo que ordena la bandeja y
    // no dicen nada del paciente fuera de esta ruta. El resumen va cifrado.
    await resumenRef(uid, convId).set(
      {
        datos: encryptField(JSON.stringify(generado.resumen)),
        nivel: generado.resumen.nivel,
        banderas: generado.resumen.banderas.length,
        confianza: generado.resumen.confianza,
        generadoEn: ahora,
        version: VERSION_RESUMEN,
        modelo: generado.modelo,
        mensajes: mensajes.length,
      },
      { merge: true }
    );

    await registrarAcceso(acceso.email, forzar ? 'resumen_regenerado' : 'resumen', uid, convId);
    console.info(`[Admin] ${acceso.email} abrió la consulta ${convId}: ${generado.resumen.nivel}.`);

    const revision = guardado.exists ? guardado : null;
    const nota = revision?.get('nota');
    return {
      success: true,
      data: {
        uid,
        convId,
        paciente,
        resumen: generado.resumen,
        generadoEn: ahora.toDate().toISOString(),
        modelo: generado.modelo,
        mensajesResumidos: mensajes.length,
        mensajesAhora,
        revisadaPor: (revision?.get('revisadaPor') as string | undefined) ?? null,
        revisadaEn: enTexto(revision?.get('revisadaEn')),
        nota: nota ? decryptField(nota) : '',
      },
    };
  } catch (error) {
    console.error('[Admin] Error abriendo una consulta:', error);
    return { success: false, error: 'No se pudo abrir la consulta.' };
  }
}

/**
 * La conversación completa, para cuando el resumen no basta. Se pide aparte y
 * deja su propio registro: leer el chat entero no es lo mismo que leer la ficha.
 */
export async function obtenerTranscripcionAdmin(
  idToken: string,
  uid: string,
  convId: string
): Promise<Resultado<MensajeTranscrito[]>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };
  if (!uid.trim() || !convId.trim() || convId.includes('/')) {
    return { success: false, error: 'Falta la consulta que se va a abrir.' };
  }

  try {
    const conversacion = await conversacionRef(uid, convId).get();
    if (!conversacion.exists) return { success: false, error: 'Esa consulta ya no existe.' };

    const mensajes = await transcripcion(uid, convId);
    await registrarAcceso(acceso.email, 'transcripcion', uid, convId);
    return { success: true, data: mensajes };
  } catch (error) {
    console.error('[Admin] Error leyendo la transcripción:', error);
    return { success: false, error: 'No se pudo leer la conversación.' };
  }
}

/**
 * Marca la consulta como vista por el médico y guarda su nota.
 *
 * La nota es la conducta que decidió quien revisó y es dato clínico: va cifrada
 * como todo lo demás. Hoy no se le muestra al paciente; ese es otro paso y otra
 * decisión.
 */
export async function marcarConsultaRevisada(
  idToken: string,
  uid: string,
  convId: string,
  nota: string
): Promise<Resultado<{ revisadaEn: string }>> {
  const acceso = await verifyAdminAccess(idToken);
  if (!acceso.ok) return { success: false, error: acceso.error };
  if (!uid.trim() || !convId.trim() || convId.includes('/')) {
    return { success: false, error: 'Falta la consulta que se va a marcar.' };
  }

  const limpia = nota.trim().slice(0, 2000);
  try {
    const ref = resumenRef(uid, convId);
    if (!(await ref.get()).exists) {
      return { success: false, error: 'Abre primero la consulta: no hay resumen que revisar.' };
    }

    const ahora = Timestamp.now();
    await ref.set(
      {
        revisadaPor: acceso.email,
        revisadaEn: ahora,
        nota: limpia ? encryptField(limpia) : FieldValue.delete(),
      },
      { merge: true }
    );

    await registrarAcceso(acceso.email, 'revision', uid, convId);
    console.info(`[Admin] ${acceso.email} revisó la consulta ${convId}.`);
    return { success: true, data: { revisadaEn: ahora.toDate().toISOString() } };
  } catch (error) {
    console.error('[Admin] Error marcando la consulta como revisada:', error);
    return { success: false, error: 'No se pudo guardar la revisión.' };
  }
}
