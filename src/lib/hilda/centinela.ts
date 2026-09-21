import { ALARMAS_UNIVERSALES } from './alarmas-universales';
import type { Decision, EstadoConsulta, EstadoSigno, Lectura, ProtocoloActivo, SignoDeAlarma } from './tipos';

/**
 * Centinela de alarma: decide la ruta de cada turno. Es código sin IA a propósito:
 * la regla "un signo de alarma presente deriva a urgencias" no puede depender de
 * que un modelo de lenguaje la siga ese día.
 */

/** Turnos de preguntas antes de orientar aunque falten datos (los faltantes quedan como signos a vigilar). */
export const MAX_TURNOS_ENTREVISTA = 3;

export interface EntradaCentinela {
  estado: EstadoConsulta;
  protocolo: ProtocoloActivo | null;
  /** null si la IA que lee la conversación falló en este turno. */
  lectura: Lectura | null;
  /** Signos universales con palabras clave en el último mensaje del paciente. */
  coincidencias: string[];
}

export function signosVigilados(protocolo: ProtocoloActivo | null): SignoDeAlarma[] {
  return [...ALARMAS_UNIVERSALES, ...(protocolo?.signos ?? [])];
}

export function decidir({ estado, protocolo, lectura, coincidencias }: EntradaCentinela): Decision {
  const signos = signosVigilados(protocolo);
  const porId = new Map(signos.map((s) => [s.id, s]));

  // Sin lectura de la IA, solo quedan las palabras clave: una coincidencia deriva.
  if (!lectura) {
    const disparados = coincidencias.map((id) => porId.get(id)).filter((s): s is SignoDeAlarma => !!s);
    if (disparados.length) {
      return {
        fase: 'derivacion_urgente',
        disparados,
        signosPorAclarar: [],
        preguntasPendientes: [],
        razon: 'lector sin respuesta + palabra clave de alarma',
      };
    }
    return {
      fase: protocolo ? 'orientacion' : 'sin_protocolo',
      disparados: [],
      signosPorAclarar: [],
      preguntasPendientes: [],
      razon: 'lector sin respuesta, sin palabras clave',
    };
  }

  const leidos = new Map(lectura.signos.map((s) => [s.id, s.estado] as const));
  // Palabra clave + lector que duda ("posible") = presente: ante la duda se deriva.
  // Palabra clave que el lector no evaluó = posible: se aclara en este turno.
  // Solo un "ausente" explícito del lector ("no tengo dolor en el pecho") la anula.
  for (const id of coincidencias) {
    const actual = leidos.get(id);
    if (actual === 'posible') leidos.set(id, 'presente');
    else if (!actual || actual === 'sin_dato') leidos.set(id, 'posible');
  }

  const disparados = signos.filter((s) => leidos.get(s.id) === 'presente' && estado.signos[s.id] !== 'presente');
  if (disparados.length) {
    return {
      fase: 'derivacion_urgente',
      disparados,
      signosPorAclarar: [],
      preguntasPendientes: [],
      razon: `signo presente: ${disparados.map((s) => s.id).join(', ')}`,
    };
  }

  const estadoDe = (s: SignoDeAlarma): EstadoSigno => leidos.get(s.id) ?? estado.signos[s.id] ?? 'sin_dato';
  // Primero lo "posible" (universal o del protocolo); después lo del protocolo que nadie ha preguntado.
  // Los universales sin dato no se preguntan uno por uno: sería absurdo en una consulta por diarrea.
  const posibles = signos.filter((s) => estadoDe(s) === 'posible');
  const sinDato = (protocolo?.signos ?? []).filter((s) => estadoDe(s) === 'sin_dato');
  const signosPorAclarar = [...posibles, ...sinDato];

  const respondidas = new Set([...estado.preguntasRespondidas, ...lectura.preguntasRespondidas]);
  const preguntasPendientes = (protocolo?.preguntas ?? []).filter((p) => !respondidas.has(p.id));

  const faltaInformacion = posibles.length > 0 || (protocolo !== null && (sinDato.length > 0 || preguntasPendientes.length > 0));
  if (faltaInformacion && estado.turnosDeEntrevista < MAX_TURNOS_ENTREVISTA) {
    return {
      fase: 'entrevista',
      disparados: [],
      signosPorAclarar,
      preguntasPendientes,
      razon: `faltan datos: ${posibles.length} posibles, ${sinDato.length} sin dato, ${preguntasPendientes.length} preguntas`,
    };
  }

  return {
    fase: protocolo ? 'orientacion' : 'sin_protocolo',
    disparados: [],
    signosPorAclarar,
    preguntasPendientes,
    razon: faltaInformacion ? 'límite de turnos de entrevista' : 'información completa',
  };
}

/** Estado que se guarda para el siguiente turno. */
export function siguienteEstado(
  estado: EstadoConsulta,
  decision: Decision,
  lectura: Lectura | null,
  protocolo: ProtocoloActivo | null
): EstadoConsulta {
  const signos = { ...estado.signos };
  for (const s of lectura?.signos ?? []) {
    // Lo presente no se "olvida" aunque en un turno posterior el lector no lo vea.
    if (signos[s.id] === 'presente') continue;
    if (s.estado !== 'sin_dato' || !signos[s.id]) signos[s.id] = s.estado;
  }
  for (const s of decision.disparados) signos[s.id] = 'presente';

  return {
    motivoId: protocolo?.motivoId ?? estado.motivoId ?? lectura?.motivoId ?? null,
    protocoloVersion: protocolo?.version ?? estado.protocoloVersion,
    turnosDeEntrevista: estado.turnosDeEntrevista + (decision.fase === 'entrevista' ? 1 : 0),
    alarmaActivada: estado.alarmaActivada || decision.fase === 'derivacion_urgente',
    signos,
    preguntasRespondidas: [...new Set([...estado.preguntasRespondidas, ...(lectura?.preguntasRespondidas ?? [])])],
  };
}
