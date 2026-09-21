import { SECCIONES_PROTOCOLO } from '@/lib/protocolos';
import type { Decision, EstadoConsulta, ProtocoloActivo, SignoDeAlarma } from './tipos';

/**
 * Agente entrevistador: la IA redacta, pero qué hace en cada turno lo fija el
 * centinela. Aquí se traduce esa decisión a instrucciones para la IA.
 */

const MAX_PREGUNTAS_POR_TURNO = 2;

function lista(textos: string[]): string {
  return textos.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

function bloqueProtocolo(protocolo: ProtocoloActivo): string {
  const secciones = SECCIONES_PROTOCOLO.map(({ id, titulo }) => {
    const frases = protocolo.frases.filter((f) => f.seccion === id);
    if (!frases.length) return null;
    const lineas = frases.map((f) => `- ${f.texto} [Fuente: ${protocolo.nombresFuentes[f.fuente] ?? f.fuente}]`).join('\n');
    return `### ${titulo}\n${lineas}`;
  }).filter(Boolean);
  return `PROTOCOLO APROBADO — ${protocolo.motivo} (${protocolo.edad}), versión ${protocolo.version}
Estas frases las aprobó el médico responsable a partir de guías de práctica clínica. Para este motivo:
- Tus recomendaciones de manejo, cuidados y cuándo consultar salen SOLO de estas frases. Puedes decirlas con calidez y en palabras sencillas, sin cambiar su sentido ni agregar recomendaciones que no estén aquí.
- Cuando des una recomendación, menciona su fuente en términos generales (por ejemplo "según la guía del Ministerio de Salud").
- Si el paciente pregunta algo que estas frases no cubren, dilo con honestidad y recomiéndale consultarlo con un profesional.

${secciones.join('\n\n')}`;
}

function textosSignos(signos: SignoDeAlarma[]): string[] {
  return signos.map((s) => s.texto);
}

export function instruccionDelTurno(decision: Decision, estado: EstadoConsulta, protocolo: ProtocoloActivo | null): string {
  const partes: string[] = [];
  if (protocolo) partes.push(bloqueProtocolo(protocolo));

  if (estado.alarmaActivada) {
    partes.push(`ALERTA DE ESTA CONSULTA: ya se detectó un signo de alarma y se le indicó al paciente ir a urgencias o llamar al 123. En tu respuesta recuérdale ir a urgencias; responde solo dudas prácticas y nunca ofrezcas cuidados en casa como alternativa a la atención urgente.`);
  }

  if (decision.fase === 'entrevista') {
    const porPreguntar = [
      ...decision.signosPorAclarar.map((s) => `Aclarar si hay: ${s.texto}`),
      ...decision.preguntasPendientes.map((p) => p.texto),
    ].slice(0, MAX_PREGUNTAS_POR_TURNO);
    partes.push(`TU TAREA EN ESTE TURNO: entrevista. Haz como máximo ${MAX_PREGUNTAS_POR_TURNO} preguntas cortas y claras, en este orden de prioridad:
${lista(porPreguntar)}
Todavía no des recomendaciones de manejo. Si el paciente pide qué hacer, explícale que primero necesitas estos datos para orientarlo con seguridad. Termina tu mensaje con una pregunta.`);
  } else if (decision.fase === 'orientacion' && protocolo) {
    const vigilar = protocolo.signos.length ? `\nIncluye la lista de signos de alarma por los que debe ir a urgencias de inmediato:\n${lista(textosSignos(protocolo.signos))}` : '';
    const faltantes = decision.signosPorAclarar.length
      ? `\nNo se alcanzó a aclarar: ${textosSignos(decision.signosPorAclarar).join('; ')}. Pídele que esté atento a eso.`
      : '';
    partes.push(`TU TAREA EN ESTE TURNO: orientación. Con lo que ya sabes del caso, da la orientación usando solo las frases del protocolo aprobado: cuidados en casa, qué no hacer y cuándo consultar.${vigilar}${faltantes}`);
  }

  return partes.length ? `\n\n════════════════════════════════════════════════════════\n${partes.join('\n\n')}` : '';
}
