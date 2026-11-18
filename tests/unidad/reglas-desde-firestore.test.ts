/**
 * La aduana de la base de reglas.
 *
 * Lo que se prueba aquí no es medicina: es que nada con forma rara llegue al
 * ejecutor, y sobre todo que un documento a medio escribir **no** publique media
 * base. El fallo que estas pruebas existen para impedir es el silencioso: una
 * regla que se cae sola y deja al grafo decidiendo con las que quedaron.
 */

import { describe, expect, it } from 'vitest';
import { BASE_VACIA, revisarBase, type BaseDeReglas } from '@/lib/grafo-reglas';
import { desdeFirestore, TOPE_ANIDAMIENTO } from '@/lib/reglas-desde-firestore';

const fuente = { documento: 'Guía de ejemplo', pagina: '12', anio: 2025 };
const aprobadoPor = { medico: 'Médico responsable', fecha: '2026-10-28' };

/** Una alarma que pasa las dos revisiones: la de forma y la de la casa. */
const ALARMA_BUENA = {
  id: 'dificultad_para_respirar',
  nombreClinico: 'Disnea aguda',
  cuando: { op: 'presente', hallazgo: 'disnea' },
  escalaA: 'urgencias',
  severidad: 'critica',
  fuente,
  aprobadoPor,
};

const ACTIVADOR_BUENO = {
  id: 'sospecha_de_ejemplo',
  sospecha: 'Sospecha de ejemplo',
  disparadores: { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
  prioridad: 'alta',
  fuente,
  aprobadoPor,
};

describe('Lo que no es una base de reglas no se usa como si lo fuera', () => {
  it('sin documento, base vacía y lo dice', () => {
    for (const nada of [undefined, null]) {
      const { base, problemas } = desdeFirestore(nada);
      expect(base).toEqual(BASE_VACIA);
      expect(problemas).toHaveLength(1);
    }
  });

  it('un texto, un número o una lista en lugar de la base no pasan', () => {
    for (const raro of ['la base', 42, [ALARMA_BUENA]]) {
      const { base, problemas } = desdeFirestore(raro);
      expect(base).toEqual(BASE_VACIA);
      expect(problemas.length).toBeGreaterThan(0);
    }
  });

  it('una clase que falta es una lista vacía, no un error', () => {
    const { base, problemas } = desdeFirestore({ alarmas: [ALARMA_BUENA] });
    expect(problemas).toEqual([]);
    expect(base.alarmas).toHaveLength(1);
    expect(base.arboles).toEqual([]);
    expect(base.activadores).toEqual([]);
  });

  it('una clase que está y no es una lista sí es un error', () => {
    const { base, problemas } = desdeFirestore({ alarmas: { 0: ALARMA_BUENA } });
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('"alarmas"'))).toBe(true);
  });
});

describe('Una base bien formada entra entera, y solo ella', () => {
  it('lo que entra es lo que el revisor de la casa aprueba', () => {
    const { base, problemas } = desdeFirestore({
      alarmas: [ALARMA_BUENA],
      activadores: [ACTIVADOR_BUENO],
    });
    expect(problemas).toEqual([]);
    expect(base.alarmas[0].id).toBe('dificultad_para_respirar');
    expect(base.activadores[0].prioridad).toBe('alta');
    // La otra mitad de la revisión: fuente, firma y reglas de la casa.
    expect(revisarBase(base)).toEqual([]);
  });

  it('los campos de más del documento se caen y no llegan al ejecutor', () => {
    const { base, problemas } = desdeFirestore({
      alarmas: [{ ...ALARMA_BUENA, loQueSea: 'algo que nadie declaró', escalaA: 'urgencias' }],
      vocabulario: 'una clase que no existe',
    });
    expect(problemas).toEqual([]);
    expect(Object.keys(base.alarmas[0])).not.toContain('loQueSea');
    expect(base).not.toHaveProperty('vocabulario');
  });

  it('un campo opcional ausente no queda como undefined, que Firestore no admite', () => {
    const { base } = desdeFirestore({ activadores: [ACTIVADOR_BUENO] });
    const claves = Object.keys(base.activadores[0]);
    expect(claves).not.toContain('requisitos');
    expect(claves).not.toContain('nivelMinimo');
    expect(claves).not.toContain('explicacionesComunes');
  });

  it('la temporalidad declarada sobrevive el viaje', () => {
    const { base, problemas } = desdeFirestore({
      activadores: [
        {
          ...ACTIVADOR_BUENO,
          requisitos: { op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' },
        },
      ],
    });
    expect(problemas).toEqual([]);
    expect(base.activadores[0].requisitos).toEqual({
      op: 'presente',
      hallazgo: 'tabaquismo',
      temporalidad: 'antecedente',
    });
  });
});

describe('Un problema en una regla tumba la base entera, nunca media', () => {
  it('una alarma malformada no deja publicar el activador que estaba bien', () => {
    const { base, problemas } = desdeFirestore({
      alarmas: [{ ...ALARMA_BUENA, cuando: { hallazgo: 'disnea' } }],
      activadores: [ACTIVADOR_BUENO],
    });
    // Esto es el corazón del archivo: el activador bueno NO entra solo.
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('no dice su "op"'))).toBe(true);
  });

  it('una regla sin fuente ni firma se rechaza por forma antes de llegar al revisor', () => {
    const sinNada = { ...ALARMA_BUENA };
    delete (sinNada as Record<string, unknown>).fuente;
    const { base, problemas } = desdeFirestore({ alarmas: [sinNada] });
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('no trae "fuente"'))).toBe(true);
  });

  it('una firma que no es un objeto no pasa por un hueco en el revisor', () => {
    const { base, problemas } = desdeFirestore({
      alarmas: [{ ...ALARMA_BUENA, aprobadoPor: 'el médico responsable' }],
    });
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('no trae "aprobadoPor"'))).toBe(true);
  });

  it('dos reglas con el mismo id no entran: el log del turno dejaría de decir cuál se disparó', () => {
    const { base, problemas } = desdeFirestore({ alarmas: [ALARMA_BUENA, ALARMA_BUENA] });
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('más de una regla con el id'))).toBe(true);
  });
});

describe('Las condiciones son lo que más hay que mirar', () => {
  const conCondicion = (cuando: unknown) => desdeFirestore({ alarmas: [{ ...ALARMA_BUENA, cuando }] });

  it('una temporalidad inventada se rechaza, porque si no la regla callaría en silencio', () => {
    const { base, problemas } = conCondicion({
      op: 'presente',
      hallazgo: 'disnea',
      temporalidad: 'hace un rato',
    });
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('no es una temporalidad'))).toBe(true);
  });

  it('una operación que nadie implementó se rechaza', () => {
    const { problemas } = conCondicion({ op: 'parecido_a', hallazgo: 'disnea' });
    expect(problemas.some((p) => p.includes('no es una operación conocida'))).toBe(true);
  });

  it('una condición sin hallazgo se rechaza', () => {
    const { problemas } = conCondicion({ op: 'presente', hallazgo: '   ' });
    expect(problemas.some((p) => p.includes('no nombra un hallazgo'))).toBe(true);
  });

  it('comparar un número contra un texto se rechaza', () => {
    const { problemas } = conCondicion({ op: '>=', hallazgo: 'fiebre_medida', valor: '38' });
    expect(problemas.some((p) => p.includes('no es un número'))).toBe(true);
  });

  it('un NaN tampoco es un número para comparar', () => {
    const { problemas } = conCondicion({ op: '>=', hallazgo: 'fiebre_medida', valor: NaN });
    expect(problemas.some((p) => p.includes('no es un número'))).toBe(true);
  });

  it('"en" sin valores, y con un valor que no es número ni texto', () => {
    expect(conCondicion({ op: 'en', hallazgo: 'disnea', valores: [] }).problemas.length).toBeGreaterThan(0);
    expect(
      conCondicion({ op: 'en', hallazgo: 'disnea', valores: ['si', { raro: true }] }).problemas.length
    ).toBeGreaterThan(0);
  });

  it('"alMenos" necesita un n entero de 1 o más', () => {
    const de = [{ op: 'presente', hallazgo: 'disnea' }];
    for (const n of [undefined, 0, -1, 1.5, '2']) {
      const { problemas } = conCondicion({ op: 'alMenos', n, de });
      expect(problemas.some((p) => p.includes('"alMenos"'))).toBe(true);
    }
    expect(conCondicion({ op: 'alMenos', n: 1, de }).problemas).toEqual([]);
  });

  it('una compuesta sin nada dentro se rechaza', () => {
    expect(conCondicion({ op: 'todas', de: [] }).problemas.length).toBeGreaterThan(0);
    expect(conCondicion({ op: 'alguna' }).problemas.length).toBeGreaterThan(0);
  });

  it('una compuesta con una rama mala se rechaza entera', () => {
    const { problemas } = conCondicion({
      op: 'todas',
      de: [{ op: 'presente', hallazgo: 'disnea' }, { op: 'presente' }],
    });
    expect(problemas.some((p) => p.includes('de[1]'))).toBe(true);
  });

  it('una condición absurdamente anidada se para en el tope', () => {
    let cond: unknown = { op: 'presente', hallazgo: 'disnea' };
    for (let i = 0; i <= TOPE_ANIDAMIENTO + 1; i++) cond = { op: 'todas', de: [cond] };
    const { base, problemas } = conCondicion(cond);
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('anida más de'))).toBe(true);
  });
});

describe('Los árboles, que son lo más hondo del documento', () => {
  const NODO_FINAL = {
    id: 'cierre',
    desenlace: {
      nivel: 'consulta_general',
      paraElPaciente: {
        explicacionProbable: 'Lo más probable es algo pasajero que conviene que alguien le mire.',
        noSeResuelveAqui: 'Desde aquí no se puede revisar a la persona.',
        planDelIntervalo: ['Tomar agua'],
      },
      paraElMedico: { hipotesis: 'Cuadro inespecífico', loQueQuedaSinValorar: ['Examen físico'] },
      aprobadoPor,
    },
  };

  const arbol = (extra: Record<string, unknown> = {}) => ({
    id: 'fiebre',
    motivo: 'Tengo fiebre',
    raiz: 'inicio',
    nodos: [
      { id: 'inicio', llena: 'fiebre_medida', ramas: [{ cuando: { op: 'presente', hallazgo: 'fiebre_medida' }, ir: 'cierre' }] },
      NODO_FINAL,
    ],
    ...extra,
  });

  it('un árbol completo entra y pasa el revisor de la casa', () => {
    const { base, problemas } = desdeFirestore({ arboles: [arbol()] });
    expect(problemas).toEqual([]);
    expect(base.arboles[0].nodos).toHaveLength(2);
    expect(revisarBase(base)).toEqual([]);
  });

  it('un desenlace al que le falta el texto del paciente se rechaza', () => {
    const roto = JSON.parse(JSON.stringify(arbol())) as Record<string, unknown>;
    const nodos = roto.nodos as Record<string, unknown>[];
    delete ((nodos[1].desenlace as Record<string, unknown>).paraElPaciente as Record<string, unknown>)
      .explicacionProbable;
    const { base, problemas } = desdeFirestore({ arboles: [roto] });
    expect(base).toEqual(BASE_VACIA);
    expect(problemas.some((p) => p.includes('explicacionProbable'))).toBe(true);
  });

  it('un árbol sin nodos no es un árbol', () => {
    const { problemas } = desdeFirestore({ arboles: [arbol({ nodos: [] })] });
    expect(problemas.some((p) => p.includes('"nodos"'))).toBe(true);
  });

  it('una rama que apunta a un nodo inexistente la caza el revisor, no la aduana', () => {
    const { base, problemas } = desdeFirestore({
      arboles: [
        arbol({
          nodos: [
            { id: 'inicio', llena: 'fiebre_medida', ramas: [{ cuando: { op: 'presente', hallazgo: 'fiebre_medida' }, ir: 'no_existe' }] },
            NODO_FINAL,
          ],
        }),
      ],
    });
    // La forma está bien: es una referencia rota, y de eso habla `revisarBase()`.
    expect(problemas).toEqual([]);
    expect(revisarBase(base).some((p) => p.includes('no_existe'))).toBe(true);
  });
});

describe('La aduana no bendice nada: las reglas de la casa siguen siendo del revisor', () => {
  it('una alarma que exige un antecedente pasa la forma y la tumba el revisor', () => {
    const { base, problemas } = desdeFirestore({
      alarmas: [
        {
          ...ALARMA_BUENA,
          cuando: { op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' },
        },
      ],
    });
    expect(problemas).toEqual([]);
    const deLaCasa = revisarBase(base as BaseDeReglas);
    expect(deLaCasa.some((p) => p.includes('no puede exigir nada'))).toBe(true);
  });

  it('un nivel de atención inventado pasa la forma y lo tumba el revisor', () => {
    const { base, problemas } = desdeFirestore({
      alarmas: [{ ...ALARMA_BUENA, escalaA: 'ambulancia_aerea' }],
    });
    expect(problemas).toEqual([]);
    expect(revisarBase(base).some((p) => p.includes('ambulancia_aerea'))).toBe(true);
  });
});
