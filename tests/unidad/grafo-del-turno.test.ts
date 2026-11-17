import { describe, expect, it } from 'vitest';
import { registrar, type HallazgoRegistrado } from '@/lib/hallazgos';
import { fichaVacia } from '@/lib/ficha';
import { type BaseDeReglas, BASE_VACIA, revisarBase } from '@/lib/grafo-reglas';
import { BASE_DE_REGLAS, tieneReglas } from '@/lib/base-de-reglas';
import {
  TOPE_HALLAZGOS_EPISODIO,
  acumular,
  correrElGrafo,
  resumenParaLog,
} from '@/lib/grafo-del-turno';
import { desdeFirestore } from '@/lib/hallazgos-del-episodio';

const HOY = '2026-11-17';
const AYER = '2026-11-16';

/**
 * REGLAS DE EJEMPLO, NO APROBADAS. Viven aquí y no en `src/` por la misma razón
 * que las del ejecutor: nada clínico sin aprobar entra al código que corre en
 * producción. La alarma de ideación suicida está tomada del diseño, donde es
 * alarma universal.
 */
const BASE_CON_UNA_ALARMA: BaseDeReglas = {
  ...BASE_VACIA,
  alarmas: [
    {
      id: 'ideacion_suicida',
      nombreClinico: 'Ideación suicida',
      cuando: { op: 'presente', hallazgo: 'ideacion_suicida' },
      escalaA: 'urgencias',
      severidad: 'critica',
      fuente: { documento: 'Guía de ejemplo', pagina: '1' },
      aprobadoPor: { medico: 'Médico de ejemplo', fecha: '2026-10-28' },
    },
  ],
};

function hallazgo(
  id: string,
  frase: string,
  fecha = HOY,
  temporalidad: 'actual' | 'antecedente' = 'actual'
): HallazgoRegistrado {
  const r = registrar({ id, estado: 'positivo', procedencia: 'relato', frase, fecha, temporalidad });
  if (!r.ok) throw new Error(`la prueba armó un hallazgo inválido: ${r.motivo}`);
  return r.hallazgo;
}

describe('la base de reglas que corre en producción', () => {
  it('está vacía: nada clínico sin aprobar decide conducta', () => {
    expect(tieneReglas(BASE_DE_REGLAS)).toBe(false);
  });

  it('está bien formada, para que el día que tenga reglas el revisor ya corra', () => {
    expect(revisarBase(BASE_DE_REGLAS)).toEqual([]);
  });
});

describe('acumular los hallazgos del episodio', () => {
  it('pone lo nuevo delante: el ejecutor resuelve un repetido con el primero', () => {
    const previo = hallazgo('dolor_toracico', 'me dolía el pecho', AYER);
    const nuevo = hallazgo('dolor_toracico', 'ahora me duele más', HOY);

    const salida = acumular([previo], [nuevo]);

    expect(salida).toHaveLength(1);
    expect(salida[0].frase).toBe('ahora me duele más');
  });

  it('no mezcla el mismo hallazgo de hoy con el antecedente', () => {
    const antecedente = hallazgo('dolor_toracico', 'me dolió hace cinco años', AYER, 'antecedente');
    const actual = hallazgo('dolor_toracico', 'me duele ahora', HOY, 'actual');

    const salida = acumular([antecedente], [actual]);

    expect(salida).toHaveLength(2);
    expect(salida.map((h) => h.temporalidad)).toEqual(['actual', 'antecedente']);
  });

  it('corta por el tope y se queda con los más nuevos', () => {
    const viejos = Array.from({ length: TOPE_HALLAZGOS_EPISODIO + 5 }, (_, i) =>
      hallazgo('disnea', `me faltaba el aire el día ${i}`, AYER)
    ).map((h, i) => ({ ...h, id: `disnea_${i}` }) as HallazgoRegistrado);
    const nuevo = hallazgo('ideacion_suicida', 'ya no quiero vivir');

    const salida = acumular(viejos, [nuevo]);

    expect(salida).toHaveLength(TOPE_HALLAZGOS_EPISODIO);
    expect(salida[0].id).toBe('ideacion_suicida');
  });
});

describe('correr el grafo dentro del turno', () => {
  it('sin ficha no corre, y lo dice', () => {
    const g = correrElGrafo({ ficha: null, previos: [], nuevos: [], hoy: HOY });

    expect(g.resultado).toBeNull();
    expect(g.porQueNoCorrio).toBe('sin_ficha');
    expect(g.alarma).toBe(false);
    expect(resumenParaLog(g)).toContain('no corrió');
  });

  it('con la base vacía no corre aunque haya una señal de peligro', () => {
    const g = correrElGrafo({
      ficha: fichaVacia('m1'),
      previos: [],
      nuevos: [hallazgo('ideacion_suicida', 'ya no quiero vivir')],
      hoy: HOY,
      base: BASE_VACIA,
    });

    expect(g.porQueNoCorrio).toBe('base_sin_reglas');
    expect(g.alarma).toBe(false);
    // Y no es lo mismo que "corrió y no encontró nada": el log no puede
    // dejar que el silencio se lea como tranquilidad.
    expect(resumenParaLog(g)).toContain('la base de reglas no tiene nada aprobado');
  });

  it('guarda los hallazgos del episodio aunque no haya corrido', () => {
    const g = correrElGrafo({
      ficha: null,
      previos: [hallazgo('disnea', 'me falta el aire')],
      nuevos: [hallazgo('edema', 'tengo los pies hinchados')],
      hoy: HOY,
    });

    expect(g.hallazgos.map((h) => h.id)).toEqual(['edema', 'disnea']);
  });

  it('dispara la alarma con lo que la persona acaba de decir', () => {
    const g = correrElGrafo({
      ficha: fichaVacia('m1'),
      previos: [],
      nuevos: [hallazgo('ideacion_suicida', 'ya no quiero vivir')],
      hoy: HOY,
      base: BASE_CON_UNA_ALARMA,
    });

    expect(g.alarma).toBe(true);
    expect(g.piso).toBe('urgencias');
    expect(resumenParaLog(g)).toContain('ALARMA: ideacion_suicida');
  });

  /**
   * La prueba que justifica que el episodio tenga dónde vivir. Sin hallazgos
   * guardados, el turno en que la persona dice "no, nada más" borraría la
   * alarma del turno anterior.
   */
  it('sigue disparada en un turno que no aporta nada nuevo', () => {
    const g = correrElGrafo({
      ficha: fichaVacia('m1'),
      previos: [hallazgo('ideacion_suicida', 'ya no quiero vivir', AYER)],
      nuevos: [],
      hoy: HOY,
      base: BASE_CON_UNA_ALARMA,
    });

    expect(g.alarma).toBe(true);
    expect(g.piso).toBe('urgencias');
  });

  it('la alarma trae la frase de la que salió', () => {
    const g = correrElGrafo({
      ficha: fichaVacia('m1'),
      previos: [],
      nuevos: [hallazgo('ideacion_suicida', 'ya no quiero vivir')],
      hoy: HOY,
      base: BASE_CON_UNA_ALARMA,
    });

    expect(g.resultado?.alarmas[0].evidencia).toContain('ya no quiero vivir');
  });
});

describe('lo que estaba guardado vuelve a pasar por registrar()', () => {
  it('acepta lo que sigue siendo válido', () => {
    const { hallazgos, rechazados } = desdeFirestore([hallazgo('disnea', 'me falta el aire')]);

    expect(rechazados).toEqual([]);
    expect(hallazgos.map((h) => h.id)).toEqual(['disnea']);
  });

  it('deja fuera un hallazgo que ya no está en el vocabulario', () => {
    const { hallazgos, rechazados } = desdeFirestore([
      { id: 'lo_que_se_borro', estado: 'positivo', procedencia: 'relato', frase: 'algo', fecha: HOY },
    ]);

    expect(hallazgos).toEqual([]);
    expect(rechazados[0]).toContain('no está en el vocabulario');
  });

  it('deja fuera lo que viene del relato sin la frase que lo prueba', () => {
    const { hallazgos, rechazados } = desdeFirestore([
      { id: 'disnea', estado: 'positivo', procedencia: 'relato', fecha: HOY },
    ]);

    expect(hallazgos).toEqual([]);
    expect(rechazados[0]).toContain('no trae la frase');
  });

  it('un documento sin el arreglo no es un error', () => {
    expect(desdeFirestore(undefined)).toEqual({ hallazgos: [], rechazados: [] });
  });
});
