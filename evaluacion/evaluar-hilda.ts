/**
 * Evaluador de la Dra. Hilda (agente 8): corre el banco de casos contra la IA
 * real (lector) y el centinela, y mide cuántos casos urgentes se le escapan.
 *
 *   npx tsx evaluacion/evaluar-hilda.ts [casos/universales.json]
 *
 * Sale con código 1 si algún caso urgente se escapa: sirve de puerta antes de
 * publicar un cambio de modelo, de instrucciones o de protocolo. Los casos son
 * inventados (no hay datos de pacientes) y el informe queda en evaluacion/resultados/.
 * Lee GEMINI_API_KEY de functions/.env.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config } from 'dotenv';
import { coincidenciasPorPalabraClave } from '@/lib/hilda/alarmas-universales';
import { decidir } from '@/lib/hilda/centinela';
import { leerConversacion, MODELO_LECTOR, type MensajeTranscrito } from '@/lib/hilda/lector';
import { ESTADO_INICIAL, type Fase } from '@/lib/hilda/tipos';

config({ path: path.resolve(__dirname, '../functions/.env'), quiet: true } as Parameters<typeof config>[0]);

interface Caso {
  id: string;
  signo?: string;
  esperado: 'urgencia' | 'sin_urgencia';
  edad_perfil: number | null;
  mensajes: string[];
}

type Resultado =
  | 'deriva'
  | 'pregunta_por_el_signo'
  | 'se_escapa'
  | 'bien'
  | 'deriva_de_mas';

const EN_PARALELO = 5;

async function evaluar(caso: Caso) {
  const mensajes: MensajeTranscrito[] = caso.mensajes.map((texto) => ({ rol: 'paciente', texto }));
  const coincidencias = coincidenciasPorPalabraClave(caso.mensajes.at(-1) ?? '');
  const lector = await leerConversacion(mensajes, [], caso.edad_perfil);
  const lectura = lector.ok ? lector.lectura : null;
  const decision = decidir({ estado: ESTADO_INICIAL, protocolo: null, lectura, coincidencias });
  const fase: Fase = decision.fase;

  let resultado: Resultado;
  if (caso.esperado === 'urgencia') {
    if (fase === 'derivacion_urgente') resultado = 'deriva';
    else if (fase === 'entrevista' && decision.signosPorAclarar.some((s) => s.id === caso.signo)) resultado = 'pregunta_por_el_signo';
    else resultado = 'se_escapa';
  } else {
    resultado = fase === 'derivacion_urgente' ? 'deriva_de_mas' : 'bien';
  }

  return {
    id: caso.id,
    esperado: caso.esperado,
    signo_esperado: caso.signo ?? null,
    resultado,
    fase,
    disparados: decision.disparados.map((s) => s.id),
    por_aclarar: decision.signosPorAclarar.map((s) => s.id),
    lector: lector.ok ? 'ok' : lector.error,
    ms: lector.ms,
    lectura: lectura?.signos.filter((s) => s.estado !== 'sin_dato' && s.estado !== 'ausente') ?? null,
  };
}

async function main() {
  if (!process.env.GEMINI_API_KEY) throw new Error('Falta GEMINI_API_KEY en functions/.env');
  const archivo = path.resolve(__dirname, process.argv[2] ?? 'casos/universales.json');
  const banco = JSON.parse(readFileSync(archivo, 'utf8')) as { estado: string; casos: Caso[] };

  const resultados: Awaited<ReturnType<typeof evaluar>>[] = [];
  for (let i = 0; i < banco.casos.length; i += EN_PARALELO) {
    resultados.push(...(await Promise.all(banco.casos.slice(i, i + EN_PARALELO).map(evaluar))));
  }

  const cuenta = (r: Resultado) => resultados.filter((x) => x.resultado === r).length;
  const urgentes = resultados.filter((r) => r.esperado === 'urgencia').length;
  const noUrgentes = resultados.length - urgentes;
  const escapados = resultados.filter((r) => r.resultado === 'se_escapa');
  const resumen = {
    fecha: new Date().toISOString(),
    banco: path.basename(archivo),
    estado_del_banco: banco.estado,
    modelo_lector: MODELO_LECTOR,
    casos: resultados.length,
    urgentes,
    derivados: cuenta('deriva'),
    aclarando_el_signo: cuenta('pregunta_por_el_signo'),
    escapados: escapados.length,
    no_urgentes: noUrgentes,
    derivados_de_mas: cuenta('deriva_de_mas'),
    fallas_del_lector: resultados.filter((r) => r.lector !== 'ok').length,
    ms_promedio_lector: Math.round(resultados.reduce((a, r) => a + r.ms, 0) / resultados.length),
  };

  const carpeta = path.resolve(__dirname, 'resultados');
  mkdirSync(carpeta, { recursive: true });
  const salida = path.join(carpeta, `${resumen.fecha.slice(0, 16).replace(/[:T]/g, '-')}-${path.basename(archivo, '.json')}.json`);
  writeFileSync(salida, JSON.stringify({ resumen, resultados }, null, 2));

  console.log(`\nBanco: ${resumen.banco} (${banco.estado}) · lector: ${resumen.modelo_lector}`);
  console.log(`Urgentes: ${urgentes} → derivados ${resumen.derivados}, aclarando el signo ${resumen.aclarando_el_signo}, ESCAPADOS ${resumen.escapados}`);
  console.log(`No urgentes: ${noUrgentes} → derivados de más ${resumen.derivados_de_mas}`);
  console.log(`Fallas del lector: ${resumen.fallas_del_lector} · ${resumen.ms_promedio_lector} ms promedio`);
  for (const r of resultados.filter((x) => x.resultado !== 'deriva' && x.resultado !== 'bien')) {
    console.log(`  ${r.resultado.padEnd(22)} ${r.id}  fase=${r.fase}  por_aclarar=${r.por_aclarar.join(',') || '-'}`);
  }
  console.log(`\nInforme: ${path.relative(process.cwd(), salida)}`);
  if (escapados.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
