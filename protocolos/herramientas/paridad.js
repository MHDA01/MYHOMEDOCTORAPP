// Prueba de paridad, parte 2 (TypeScript): corre functions/lib/protocolos sobre los mismos
// casos que paridad.py y compara campo por campo. También comprueba que el prompt del
// redactor sea idéntico y que citas alteradas se rechacen. Sale con código 1 si algo falla.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const MHDA = path.resolve(__dirname, '..', '..');
const LIB = path.join(MHDA, 'functions/lib/protocolos');
const { verificar } = require(path.join(LIB, 'verificar.js'));
const { SISTEMA, construirUsuario } = require(path.join(LIB, 'redactar.js'));
const SALIDA = path.join(MHDA, 'protocolos', '.paridad');
const leer = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const BORR = path.join(MHDA, 'protocolos/borradores');
const FUENTES = path.join(MHDA, 'protocolos/fuentes');

const biblioteca = {
  async paginas(id) { return leer(path.join(FUENTES, 'texto', `${id}.json`)); },
  async inventario(id) { return leer(path.join(FUENTES, 'inventario', `${id}.json`)).recomendaciones; },
};

function juezDesde(verificadoPy) {
  const veredictos = new Map();
  for (const it of verificadoPy.items) {
    for (const a of it.verificacion.alertas) {
      if (a.startsWith('fidelidad: ') && !a.includes('JUNTO con')) {
        veredictos.set(it.id, { id: it.id, fiel: false, problema: a.slice('fidelidad: '.length) });
      }
    }
  }
  return async () => ({ veredictos, uso: { simulado: true, juez_confiable: true } });
}

// El orden de las partes no usadas con la misma página depende del set de Python.
const ordenar = (lista) => [...lista].sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);

(async () => {
  let fallas = 0;
  const casos = { final: 'diarrea-primera-infancia.gemini-pro-latest.raw.json', v2: 'diarrea-primera-infancia.v2-una-cita.raw.json', v1: 'diarrea-primera-infancia.v1-sin-inventario.raw.json' };
  for (const [nombre, raw] of Object.entries(casos)) {
    const py = leer(path.join(SALIDA, `${nombre}.py.json`));
    const entrada = leer(path.join(BORR, raw));
    const ts = await verificar(
      { motivo: entrada.motivo, respuesta: entrada.respuesta, generado: entrada.generado, uso_redactor: entrada.uso },
      biblioteca,
      juezDesde(py)
    );
    for (const campo of ['metricas', 'items', 'excluidas', 'sin_decision', 'decisiones_invalidas', 'vacios', 'partes_no_usadas']) {
      const a = campo === 'partes_no_usadas' ? ordenar(ts[campo]) : ts[campo];
      const b = campo === 'partes_no_usadas' ? ordenar(py[campo]) : py[campo];
      try {
        assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);
        console.log(nombre, campo, 'IGUAL');
      } catch (e) {
        fallas++;
        console.log(nombre, campo, 'DISTINTO');
        console.log(String(e.message).slice(0, 3000));
      }
    }
    console.log(nombre, 'métricas:', JSON.stringify(ts.metricas));
  }

  const prompt = leer(path.join(SALIDA, 'prompt.py.json'));
  const motivo = leer(path.join(MHDA, 'protocolos/motivos.json')).motivos.find((m) => m.id === 'diarrea-primera-infancia');
  const usuario = construirUsuario(motivo, await biblioteca.inventario('gpc-eda-2013'));
  console.log('prompt sistema', SISTEMA === prompt.sistema ? 'IGUAL' : 'DISTINTO');
  console.log('prompt usuario', usuario === prompt.usuario ? 'IGUAL' : 'DISTINTO');
  if (SISTEMA !== prompt.sistema || usuario !== prompt.usuario) fallas++;
  // Pruebas adversarias: citas alteradas deben rechazarse.
  const base = leer(path.join(BORR, casos.final));
  const borrador = JSON.parse(base.respuesta);
  const incluida = borrador.decisiones.find((d) => d.incluir && d.items?.length);
  const original = incluida.items[0].citas_literales[0];
  const alteraciones = {
    'palabra cambiada': original.replace(/\b(de|la|el|en)\b/, 'para'),
    'cita inventada': 'Se recomienda administrar miel a todos los niños con diarrea para acortar el episodio.',
    'cita de otra recomendación': borrador.decisiones.find((d) => d !== incluida && d.items?.length).items[0].citas_literales[0],
  };
  for (const [nombre, cita] of Object.entries(alteraciones)) {
    if (cita === original) { console.log('adversaria', nombre, 'NO APLICA'); continue; }
    const copia = JSON.parse(JSON.stringify(borrador));
    const d = copia.decisiones.find((x) => x.rec_id === incluida.rec_id);
    d.items = [{ ...d.items[0], citas_literales: [cita] }];
    const r = await verificar({ motivo: base.motivo, respuesta: JSON.stringify(copia), generado: '', uso_redactor: {} }, biblioteca, async () => ({ veredictos: new Map(), uso: {} }));
    const it = r.items.find((i) => i.rec_id === incluida.rec_id);
    const ok = it.verificacion.estado === 'rechazado';
    if (!ok) fallas++;
    console.log('adversaria', nombre, ok ? `RECHAZADA (${it.verificacion.razones.join('; ')})` : 'ACEPTADA — FALLA');
  }

  console.log(fallas ? `FALLAS: ${fallas}` : 'PARIDAD COMPLETA');
  process.exit(fallas ? 1 : 0);
})();
