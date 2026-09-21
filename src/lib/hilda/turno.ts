import type { GeminiContent, GeminiResult } from '@/lib/gemini';
import { coincidenciasPorPalabraClave } from './alarmas-universales';
import { decidir, siguienteEstado } from './centinela';
import { instruccionDelTurno } from './instrucciones';
import { leerConversacion, MODELO_LECTOR, type MensajeTranscrito } from './lector';
import { guardarEstado, guardarTraza, leerEstado } from './memoria';
import { protocolosActivos } from './protocolos-activos';
import { respuestaDeUrgencia, RESPUESTA_DE_RESPALDO } from './textos-agentes';
import type { ProtocoloActivo } from './tipos';
import { instruccionDeCorreccion, verificarRespuesta, type Falla } from './verificador';

/**
 * Un turno de la Dra. Hilda con sus agentes:
 *   lector (IA) → centinela (reglas) → entrevistador (IA guiada) → verificador (reglas).
 * Si hay un signo de alarma, la respuesta la escribe el código y la IA redactora no participa.
 */

/** Mensajes que lee el lector: los recientes bastan y mantienen el costo bajo. */
const MENSAJES_PARA_EL_LECTOR = 20;

export type Generador = (sistema: string, contenidos: GeminiContent[]) => Promise<GeminiResult>;

export interface EntradaTurno {
  uid: string;
  convId: string;
  /** Historial para la IA, ya armado desde Firestore (incluye el mensaje nuevo). */
  contenidos: GeminiContent[];
  /** Último mensaje del paciente, tal como lo escribió. */
  ultimoMensaje: string;
  /** Instrucciones base de la Dra. Hilda con el contexto del paciente. */
  sistemaBase: string;
  edadDelPerfil: number | null;
  generar: Generador;
  modeloRedactor: string;
}

export type ResultadoTurno = { ok: true; texto: string } | { ok: false; error: Exclude<GeminiResult, { ok: true }> };

/** Interruptor de emergencia: HILDA_AGENTES=apagado vuelve al chat de una sola llamada. */
export function agentesEncendidos(): boolean {
  return process.env.HILDA_AGENTES !== 'apagado';
}

function transcribir(contenidos: GeminiContent[]): MensajeTranscrito[] {
  return contenidos
    .map((c) => ({
      rol: c.role === 'model' ? ('hilda' as const) : ('paciente' as const),
      texto: c.parts
        .map((p) => ('text' in p ? p.text : ''))
        .join(' ')
        .trim(),
    }))
    .filter((m) => m.texto)
    .slice(-MENSAJES_PARA_EL_LECTOR);
}

async function cargarProtocolos(): Promise<ProtocoloActivo[]> {
  try {
    return await protocolosActivos();
  } catch (error) {
    // Sin protocolos, Hilda sigue funcionando con el centinela universal y el verificador.
    console.error('[Dra. Hilda] No se pudieron cargar los protocolos activos:', error);
    return [];
  }
}

export async function responderTurno(e: EntradaTurno): Promise<ResultadoTurno> {
  const [estado, activos] = await Promise.all([leerEstado(e.uid, e.convId), cargarProtocolos()]);
  const protocoloPrevio = estado.motivoId ? activos.find((p) => p.motivoId === estado.motivoId) ?? null : null;

  const mensajes = transcribir(e.contenidos);
  const coincidencias = coincidenciasPorPalabraClave(e.ultimoMensaje);
  const lector = await leerConversacion(mensajes, protocoloPrevio ? [protocoloPrevio] : activos, e.edadDelPerfil);
  const lectura = lector.ok ? lector.lectura : null;
  if (!lector.ok) console.error(`[Dra. Hilda] Lector sin respuesta (${lector.error}); decide el centinela con palabras clave.`);

  const protocolo = protocoloPrevio ?? (lectura?.motivoId ? activos.find((p) => p.motivoId === lectura.motivoId) ?? null : null);
  const decision = decidir({ estado, protocolo, lectura, coincidencias });
  const nuevoEstado = siguienteEstado(estado, decision, lectura, protocolo);

  const trazaBase = {
    fase: decision.fase,
    razon: decision.razon,
    motivo_id: protocolo?.motivoId ?? null,
    protocolo_version: protocolo?.version ?? null,
    signos_disparados: decision.disparados.map((s) => s.id),
    signos_por_aclarar: decision.signosPorAclarar.map((s) => s.id),
    preguntas_pendientes: decision.preguntasPendientes.map((p) => p.id),
    lector: lector.ok
      ? { ok: true, ms: lector.ms, modelo: MODELO_LECTOR }
      : { ok: false, ms: lector.ms, error: lector.error, modelo: MODELO_LECTOR },
    coincidencias_palabra_clave: coincidencias,
    detalle: { lectura },
  };

  if (decision.fase === 'derivacion_urgente') {
    await guardarEstado(e.uid, e.convId, nuevoEstado);
    await guardarTraza(e.uid, e.convId, { ...trazaBase, redactor: { modelo: null, intentos: 0, fallas: [] }, respuesta: 'urgencia' });
    return { ok: true, texto: respuestaDeUrgencia(decision.disparados) };
  }

  const sistema = e.sistemaBase + instruccionDelTurno(decision, nuevoEstado, protocolo);
  const verificar = (texto: string) =>
    verificarRespuesta({
      respuesta: texto,
      fase: decision.fase,
      alarmaActivada: nuevoEstado.alarmaActivada,
      frasesAprobadas: protocolo?.frases ?? [],
    });

  const primero = await e.generar(sistema, e.contenidos);
  if (!primero.ok) {
    await guardarTraza(e.uid, e.convId, {
      ...trazaBase,
      redactor: { modelo: e.modeloRedactor, intentos: 1, fallas: [`error_${primero.kind}`] },
      respuesta: 'error',
    });
    return { ok: false, error: primero };
  }

  let texto = primero.text;
  let intentos = 1;
  const registroFallas: Falla[] = verificar(texto);
  let fallas = registroFallas;
  if (fallas.length) {
    intentos = 2;
    const segundo = await e.generar(`${sistema}\n\n${instruccionDeCorreccion(fallas)}`, e.contenidos);
    fallas = segundo.ok ? verificar(segundo.text) : [{ codigo: 'error_redactor', detalle: segundo.kind }];
    registroFallas.push(...fallas);
    texto = segundo.ok && !fallas.length ? segundo.text : RESPUESTA_DE_RESPALDO;
  }

  await guardarEstado(e.uid, e.convId, nuevoEstado);
  await guardarTraza(e.uid, e.convId, {
    ...trazaBase,
    redactor: { modelo: e.modeloRedactor, intentos, fallas: registroFallas.map((f) => f.codigo) },
    respuesta: texto === RESPUESTA_DE_RESPALDO ? 'respaldo' : 'ia',
  });
  return { ok: true, texto };
}
