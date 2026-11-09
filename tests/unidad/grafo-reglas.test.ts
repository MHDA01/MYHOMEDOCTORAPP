import { describe, expect, it } from 'vitest';
import type { HallazgoRegistrado } from '@/lib/hallazgos';
import {
  type Alarma,
  type BaseDeReglas,
  type Condicion,
  BASE_VACIA,
  evaluar,
  faltantes,
  hallazgosDeLaCondicion,
  revisarBase,
} from '@/lib/grafo-reglas';

const HOY = '2026-11-08';

const h = (
  id: string,
  estado: HallazgoRegistrado['estado'],
  extra: Partial<HallazgoRegistrado> = {}
): HallazgoRegistrado => ({
  id,
  estado,
  procedencia: 'relato',
  frase: 'lo dijo el paciente',
  fecha: HOY,
  temporalidad: 'actual',
  ...extra,
});

const fuente = { documento: 'Guía de ejemplo', pagina: '1' };
const aprobadoPor = { medico: 'Médico responsable', fecha: '2026-10-28' };

describe('Un hueco nunca satisface una condición', () => {
  it('lo que nadie preguntó deja la condición en falta, no en no', () => {
    expect(evaluar({ op: 'presente', hallazgo: 'disnea' }, [])).toBe('falta');
    expect(evaluar({ op: 'presente', hallazgo: 'disnea' }, [h('disnea', 'no_preguntado')])).toBe('falta');
  });

  it('"se preguntó y no lo sabe" tampoco se lee como un no', () => {
    const sinSaber = [h('cambio_de_peso', 'desconocido', { razon: 'no se ha pesado' })];
    expect(evaluar({ op: 'presente', hallazgo: 'cambio_de_peso' }, sinSaber)).toBe('falta');
    // `conocido` sí distingue: se preguntó, y la respuesta fue que no lo sabe.
    expect(evaluar({ op: 'conocido', hallazgo: 'cambio_de_peso' }, sinSaber)).toBe('no');
  });

  it('un hallazgo ambiguo no decide conducta', () => {
    const ambiguo = [h('patron_temporal', 'positivo', { valor: 'continuo', ambiguo: true })];
    expect(evaluar({ op: '==', hallazgo: 'patron_temporal', valor: 'continuo' }, ambiguo)).toBe('falta');
  });

  it('un negado sí es un no, y se puede preguntar por él expresamente', () => {
    const negado = [h('disnea', 'negado')];
    expect(evaluar({ op: 'presente', hallazgo: 'disnea' }, negado)).toBe('no');
    expect(evaluar({ op: 'negado', hallazgo: 'disnea' }, negado)).toBe('si');
  });

  it('un positivo sin valor no sirve para comparar: se sabe que lo tiene, no cuánto', () => {
    expect(evaluar({ op: '>=', hallazgo: 'fiebre_medida', valor: 38 }, [h('fiebre_medida', 'positivo')])).toBe('falta');
    expect(
      evaluar({ op: '>=', hallazgo: 'fiebre_medida', valor: 38 }, [h('fiebre_medida', 'positivo', { valor: 39 })])
    ).toBe('si');
    expect(evaluar({ op: '>=', hallazgo: 'fiebre_medida', valor: 38 }, [h('fiebre_medida', 'negado')])).toBe('no');
  });

  it('lo de hoy manda sobre lo de la ficha cuando la condición no dice cuál quiere', () => {
    const ambas = [
      h('tabaquismo', 'negado', { temporalidad: 'antecedente', procedencia: 'ficha' }),
      h('tabaquismo', 'positivo'),
    ];
    expect(evaluar({ op: 'presente', hallazgo: 'tabaquismo' }, ambas)).toBe('si');
    expect(evaluar({ op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' }, ambas)).toBe('no');
  });
});

describe('Las condiciones compuestas también son de tres valores', () => {
  const conFiebre = [h('fiebre_medida', 'positivo', { valor: 39 })];

  it('todas: un no la tumba, un hueco la deja en falta', () => {
    const cond: Condicion = {
      op: 'todas',
      de: [
        { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
        { op: 'presente', hallazgo: 'dolor_toracico' },
      ],
    };
    expect(evaluar(cond, conFiebre)).toBe('falta');
    expect(evaluar(cond, [...conFiebre, h('dolor_toracico', 'negado')])).toBe('no');
    expect(evaluar(cond, [...conFiebre, h('dolor_toracico', 'positivo')])).toBe('si');
  });

  it('alguna: un sí la cumple; solo es no cuando todas son no', () => {
    const cond: Condicion = {
      op: 'alguna',
      de: [
        { op: 'presente', hallazgo: 'ortopnea' },
        { op: 'presente', hallazgo: 'edema' },
      ],
    };
    expect(evaluar(cond, [h('ortopnea', 'negado')])).toBe('falta');
    expect(evaluar(cond, [h('ortopnea', 'negado'), h('edema', 'negado')])).toBe('no');
    expect(evaluar(cond, [h('ortopnea', 'positivo')])).toBe('si');
  });

  it('alMenos: es no solo cuando ni contando los huecos se llega', () => {
    const cond: Condicion = {
      op: 'alMenos',
      n: 2,
      de: [
        { op: 'presente', hallazgo: 'palpitaciones' },
        { op: 'presente', hallazgo: 'sudoracion' },
        { op: 'presente', hallazgo: 'boca_seca' },
      ],
    };
    expect(evaluar(cond, [h('palpitaciones', 'positivo')])).toBe('falta');
    expect(evaluar(cond, [h('palpitaciones', 'positivo'), h('sudoracion', 'positivo')])).toBe('si');
    expect(evaluar(cond, [h('palpitaciones', 'negado'), h('sudoracion', 'negado')])).toBe('no');
  });
});

describe('Lo que falta es lo que se pregunta', () => {
  it('saca de la condición los hallazgos que la dejaron en falta', () => {
    const cond: Condicion = {
      op: 'todas',
      de: [
        { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
        { op: 'presente', hallazgo: 'dolor_toracico' },
      ],
    };
    expect(faltantes(cond, [])).toEqual(['fiebre_medida', 'dolor_toracico']);
    expect(faltantes(cond, [h('fiebre_medida', 'positivo', { valor: 39 })])).toEqual(['dolor_toracico']);
  });

  it('una condición ya resuelta no pide nada más', () => {
    const cond: Condicion = {
      op: 'alguna',
      de: [
        { op: 'presente', hallazgo: 'ortopnea' },
        { op: 'presente', hallazgo: 'edema' },
      ],
    };
    // Si un `alguna` ya se cumplió, seguir preguntando por sus otras ramas es
    // exactamente la ráfaga de preguntas que el médico rechazó.
    expect(faltantes(cond, [h('ortopnea', 'positivo')])).toEqual([]);
    expect(faltantes(cond, [])).toEqual(['ortopnea', 'edema']);
  });

  it('no repite un hallazgo que aparece en dos ramas', () => {
    const cond: Condicion = {
      op: 'todas',
      de: [
        { op: 'presente', hallazgo: 'disnea' },
        { op: 'alguna', de: [{ op: 'presente', hallazgo: 'disnea' }, { op: 'presente', hallazgo: 'edema' }] },
      ],
    };
    expect(faltantes(cond, [])).toEqual(['disnea', 'edema']);
  });

  it('nombra todos los hallazgos de una condición, resueltos o no', () => {
    const cond: Condicion = {
      op: 'todas',
      de: [
        { op: 'presente', hallazgo: 'disnea' },
        { op: 'presente', hallazgo: 'edema' },
      ],
    };
    expect(hallazgosDeLaCondicion(cond)).toEqual(['disnea', 'edema']);
  });
});

describe('El revisor de la base: las alarmas no exigen nada', () => {
  const alarma = (cuando: Condicion): Alarma => ({
    id: 'ejemplo',
    nombreClinico: 'Alarma de ejemplo',
    cuando,
    escalaA: 'urgencias',
    severidad: 'critica',
    fuente,
    aprobadoPor,
  });

  const con = (a: Alarma): BaseDeReglas => ({ ...BASE_VACIA, alarmas: [a] });

  it('rechaza una alarma que se dispara con un antecedente negado', () => {
    // Si un "yo no tengo nada" pudiera encender o apagar una alarma, bastaría
    // eso para desactivar una señal de peligro. Y la gente subnotifica.
    const problemas = revisarBase(con(alarma({ op: 'negado', hallazgo: 'tabaquismo' })));
    expect(problemas.some((p) => p.includes('nunca enciende una alarma'))).toBe(true);
  });

  it('rechaza una alarma que exige un antecedente negable', () => {
    const problemas = revisarBase(
      con(alarma({ op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' }))
    );
    expect(problemas.some((p) => p.includes('no puede exigir nada'))).toBe(true);
  });

  it('pero sí deja leer la edad, porque hay umbrales que dependen de ella', () => {
    // La fiebre en el menor de tres meses es el ejemplo del médico responsable.
    // La edad no se niega; una gastritis sí.
    const problemas = revisarBase(
      con(
        alarma({
          op: 'todas',
          de: [
            { op: '<', hallazgo: 'edad_meses', valor: 3, temporalidad: 'antecedente' },
            { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
          ],
        })
      )
    );
    expect(problemas).toEqual([]);
  });
});

describe('El revisor de la base: trazabilidad y reglas de la casa', () => {
  it('ninguna regla entra sin fuente, sin médico y sin fecha', () => {
    const problemas = revisarBase({
      ...BASE_VACIA,
      alarmas: [
        {
          id: 'sin_papeles',
          nombreClinico: 'Alarma sin papeles',
          cuando: { op: 'presente', hallazgo: 'disnea' },
          escalaA: 'urgencias',
          severidad: 'critica',
          fuente: { documento: '' },
          aprobadoPor: { medico: '', fecha: 'ayer' },
        },
      ],
    });
    expect(problemas.some((p) => p.includes('sin fuente documental'))).toBe(true);
    expect(problemas.some((p) => p.includes('sin el médico'))).toBe(true);
    expect(problemas.some((p) => p.includes('AAAA-MM-DD'))).toBe(true);
  });

  it('una regla no puede nombrar un hallazgo que no está en el vocabulario', () => {
    const problemas = revisarBase({
      ...BASE_VACIA,
      alarmas: [
        {
          id: 'inventada',
          nombreClinico: 'Alarma inventada',
          cuando: { op: 'presente', hallazgo: 'mal_de_ojo' },
          escalaA: 'urgencias',
          severidad: 'critica',
          fuente,
          aprobadoPor,
        },
      ],
    });
    expect(problemas.some((p) => p.includes('no está en el vocabulario'))).toBe(true);
  });

  it('la palabra "síndrome" no llega al paciente', () => {
    // Decidido el 28-oct-2026: solo la ve el médico, porque es quien la
    // entiende. El paciente lee "síndrome" y piensa en una enfermedad.
    const problemas = revisarBase({
      ...BASE_VACIA,
      sindromes: [
        {
          id: 'dificultad_respiratoria',
          nombreClinico: 'Síndrome de dificultad respiratoria',
          sistema: 'respiratorio',
          criterios: { op: 'presente', hallazgo: 'disnea' },
          piso: 'consulta_prioritaria',
          explicacionLlana: 'tienes un síndrome de dificultad respiratoria',
          fuente,
          aprobadoPor,
        },
      ],
    });
    expect(problemas.some((p) => p.includes('solo la ve el médico'))).toBe(true);
  });

  it('la palabra "triage" está prohibida en todo lo visible', () => {
    const problemas = revisarBase({
      ...BASE_VACIA,
      arboles: [
        {
          id: 'ejemplo',
          motivo: 'dolor',
          raiz: 'fin',
          nodos: [
            {
              id: 'fin',
              desenlace: {
                nivel: 'casa',
                paraElPaciente: {
                  explicacionProbable: 'según el triage que hicimos, puedes manejarlo en casa',
                  noSeResuelveAqui: '',
                  planDelIntervalo: [],
                },
                paraElMedico: { hipotesis: 'dolor mecánico', loQueQuedaSinValorar: [] },
                aprobadoPor,
              },
            },
          ],
        },
      ],
    });
    expect(problemas.some((p) => p.includes('palabra prohibida "triage"'))).toBe(true);
  });

  it('un nodo que no pregunta nada y no concluye nada es un error', () => {
    const problemas = revisarBase({
      ...BASE_VACIA,
      arboles: [{ id: 'roto', motivo: 'dolor', raiz: 'vacio', nodos: [{ id: 'vacio' }] }],
    });
    expect(problemas.some((p) => p.includes('no pregunta nada y no concluye nada'))).toBe(true);
  });

  it('una rama que apunta al vacío es un error, y una raíz inexistente también', () => {
    const problemas = revisarBase({
      ...BASE_VACIA,
      arboles: [
        {
          id: 'roto',
          motivo: 'dolor',
          raiz: 'no_existe',
          nodos: [
            {
              id: 'inicio',
              llena: 'mecanismo',
              ramas: [{ cuando: { op: 'presente', hallazgo: 'mecanismo' }, ir: 'tampoco_existe' }],
            },
          ],
        },
      ],
    });
    expect(problemas.some((p) => p.includes('la raíz "no_existe"'))).toBe(true);
    expect(problemas.some((p) => p.includes('"tampoco_existe", que no existe'))).toBe(true);
  });

  it('una susceptibilidad no puede relajar un activador que no declara cómo relajarse', () => {
    const problemas = revisarBase({
      ...BASE_VACIA,
      activadores: [
        {
          id: 'neumonia',
          sospecha: 'Neumonía',
          disparadores: { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
          prioridad: 'alta',
          fuente,
          aprobadoPor,
        },
      ],
      susceptibilidades: [
        {
          id: 'epoc',
          nombreClinico: 'EPOC',
          cuando: { op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' },
          eleva: ['neumonia'],
          relaja: ['neumonia'],
          fuente,
          aprobadoPor,
        },
      ],
    });
    expect(problemas.some((p) => p.includes('no declara disparadores relajados'))).toBe(true);
  });

  it('una base vacía está bien formada', () => {
    expect(revisarBase(BASE_VACIA)).toEqual([]);
  });
});
