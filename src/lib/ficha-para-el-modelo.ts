// ============================================================
// lib/ficha-para-el-modelo.ts — La ficha, en palabras que el modelo lee
// ============================================================
//
// Vive aparte de `ficha.ts` a propósito: aquel es código puro de estructura y su
// cabecera promete que no contiene texto que nadie lea. Esto sí es texto, y por
// eso tiene su propio archivo y su propia revisión.
//
// ── POR QUÉ ESTO ABARATA EN VEZ DE ENCARECER ──
//
// Parece al revés: mandarle MÁS al modelo debería costar más. La cuenta dice
// otra cosa, porque las tres partidas de un turno no valen lo mismo.
//
//   Entrada  USD 1,50 por millón de tokens   ← esto
//   Salida   USD 9,00 por millón             ← seis veces más
//   Voz      USD 30,00 por millón de caracteres
//
// Una ficha completa pesa del orden de 600 tokens: unos COP 23 en una
// orientación de ocho turnos. Un turno entero —entrada, salida y voz— cuesta
// unos COP 99. O sea que **si la ficha le ahorra a Hilda una sola pregunta, ya
// se pagó cuatro veces**; si la conversación baja de ocho turnos a cinco,
// cuesta 23 y ahorra cerca de 300.
//
// De ahí las dos reglas de compactación de abajo. No son tacañería: son lo que
// mantiene la ficha en el lado barato de esa cuenta.
//
//   1. **Lo `no_preguntado` no se manda.** Es la mayor parte del catálogo y no
//      dice nada: que nadie haya preguntado por el tabaquismo no es un dato
//      clínico. Mandarlo sería pagar por silencio.
//   2. **Lo `negado` SÍ se manda, y entero.** "No fuma" es información que
//      cambia la conducta y que Hilda no tiene que volver a preguntar. Omitirlo
//      para ahorrar cuatro tokens le costaría un turno de COP 99.
//
// ── LO QUE ESTE TEXTO NO PUEDE HACER ──
//
// - **No convierte lo referido en hecho clínico.** Cada línea dice quién lo
//   dijo. Una alergia que contó el paciente se marca como referida; Hilda la
//   trata como real para su propia conducta, pero no la reclasifica ni la
//   asciende a diagnóstico (`debeAdvertir` en `ficha.ts`).
// - **No infiere.** Si un campo está `desconocido`, se dice que se desconoce y
//   por qué, y no se rellena con lo más probable.
// - **No apaga nada.** Un antecedente negado baja la sospecha y nunca apaga una
//   alarma: las alarmas corren sobre los hallazgos de hoy, en el ejecutor del
//   grafo, y no leen este texto.
//
// La instrucción de no repreguntar lo que ya está aquí vive en el prompt de
// sistema, que es texto clínico aprobado y además se cachea: repetirla en cada
// turno sería pagarla en cada turno.

import {
  CAMPOS_FICHA,
  capaVigente,
  caracterizacion,
  type Alergia,
  type CapaFicha,
  type Ficha,
} from '@/lib/ficha';

/** Cómo se lee cada estado. `no_preguntado` no aparece: no se manda. */
const COMO_SE_DICE: Record<string, string> = {
  positivo: 'sí',
  negado: 'no',
  desconocido: 'se desconoce',
};

const COMO_LO_SUPO_TEXTO: Record<string, string> = {
  diagnostico_medico: 'por diagnóstico médico',
  se_lo_dijeron: 'se lo dijeron',
  el_lo_cree: 'lo cree la persona',
};

const LATENCIA_TEXTO: Record<string, string> = {
  minutos: 'a los minutos',
  horas: 'a las horas',
  dias: 'a los días',
  no_recuerda: 'no recuerda cuánto después',
};

const QUE_SE_HIZO_TEXTO: Record<string, string> = {
  urgencias: 'fue a urgencias',
  suspendio: 'la suspendió',
  nada: 'no hizo nada',
};

const REEXPOSICION_TEXTO: Record<string, string> = {
  si_sin_problema: 'volvió a tomarla sin problema',
  si_le_paso_igual: 'volvió a tomarla y le pasó igual',
  no: 'no ha vuelto a tomarla',
};

/**
 * Una alergia en una línea, con lo que la hace útil: la sustancia tal como la
 * dijo la persona, qué le pasó, y si está caracterizada o no.
 *
 * Que esté **incompleta** es lo que más importa de todo esto: es justo lo que
 * Hilda tiene que terminar de preguntar, y lo que el médico necesita saber que
 * falta.
 */
function alergiaEnTexto(a: Alergia): string {
  const partes: string[] = [a.sustancia.trim()];
  if (a.manifestaciones.length) partes.push(a.manifestaciones.join(', '));
  if (a.cuantoDespues) partes.push(LATENCIA_TEXTO[a.cuantoDespues] ?? a.cuantoDespues);
  if (a.queSeHizo) partes.push(QUE_SE_HIZO_TEXTO[a.queSeHizo] ?? a.queSeHizo);
  if (a.volvioATomarla) partes.push(REEXPOSICION_TEXTO[a.volvioATomarla] ?? a.volvioATomarla);
  const cola = caracterizacion(a) === 'incompleta' ? ' [sin caracterizar]' : '';
  return `${partes.join('; ')}${cola}`;
}

/** El cuerpo de una línea: el estado y lo que lo acompaña. */
function cuerpoDeLaLinea(capa: CapaFicha): string {
  // Texto libre heredado del perfil: va entre comillas y marcado, porque no es
  // un antecedente tipado y no puede decidir conducta.
  if (capa.sinEstructurar) {
    const texto = (capa.detalle ?? '').trim();
    return texto ? `sin estructurar — "${texto}"` : 'sin estructurar';
  }

  const partes: string[] = [COMO_SE_DICE[capa.estado] ?? capa.estado];

  if (capa.magnitud) {
    const { valor, unidad, fecha } = capa.magnitud;
    partes.push(`${valor} ${unidad}${fecha ? ` (${fecha})` : ''}`);
  } else if (capa.valor !== undefined) {
    partes.push(String(capa.valor));
  }

  if (capa.alergias?.length) {
    partes.push(capa.alergias.map(alergiaEnTexto).join(' | '));
  }
  if (capa.detalle?.trim()) partes.push(capa.detalle.trim());
  if (capa.desde) partes.push(`desde ${capa.desde}`);
  if (capa.comoLoSupo) partes.push(COMO_LO_SUPO_TEXTO[capa.comoLoSupo] ?? capa.comoLoSupo);
  // Obligatoria en `desconocido`: el porqué es lo que evita repreguntar en vano.
  if (capa.estado === 'desconocido' && capa.razon?.trim()) partes.push(capa.razon.trim());

  return partes.join(' — ');
}

/** Quién lo afirmó. Un campo que caracterizó un médico no vale lo mismo. */
function procedencia(campo: { validado?: unknown }, capa: CapaFicha): string {
  if (campo.validado) return 'caracterizado por médico';
  return capa.informante === 'cuidador' ? 'referido por el cuidador' : 'referido por la persona';
}

/**
 * La ficha como bloque de texto para el modelo, o `null` si no hay nada que
 * contar —y entonces quien llama no manda el bloque, en vez de mandar un
 * encabezado vacío que igual se paga—.
 *
 * El orden es el del catálogo (`CAMPOS_FICHA`), no el de escritura: así el
 * mismo paciente produce siempre el mismo texto, que es lo que permite leer dos
 * turnos seguidos y ver qué cambió.
 */
export function fichaParaElModelo(ficha: Ficha | null | undefined): string | null {
  if (!ficha) return null;

  const lineas: string[] = [];
  for (const definicion of CAMPOS_FICHA) {
    const campo = ficha.campos[definicion.id];
    const capa = capaVigente(campo);
    // Regla 1: lo que nadie preguntó no se manda.
    if (!capa || capa.estado === 'no_preguntado') continue;
    lineas.push(
      `- ${definicion.nombreClinico}: ${cuerpoDeLaLinea(capa)} (${procedencia(campo!, capa)}, ${capa.fecha})`
    );
  }

  if (!lineas.length) return null;
  return `FICHA DE LA PERSONA (ya registrado):\n${lineas.join('\n')}`;
}
