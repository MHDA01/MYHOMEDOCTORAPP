import { describe, expect, it } from 'vitest';
import type { HallazgoRegistrado } from '@/lib/hallazgos';
import { type Ficha, fichaDesdePerfil, fichaVacia, registrarReferido } from '@/lib/ficha';
import { type BaseDeReglas, revisarBase } from '@/lib/grafo-reglas';
import {
  type EstadoConsulta,
  PRIORIDADES,
  PRESUPUESTO_POR_DEFECTO,
  evaluarTurno,
} from '@/lib/grafo-ejecutor';
import { type CasoDelArnes, correrArnes, medir, veredicto } from '@/lib/grafo-arnes';

const HOY = '2026-11-08';
const fuente = { documento: 'Guía de ejemplo', pagina: '1' };
const aprobadoPor = { medico: 'Médico responsable', fecha: '2026-10-28' };

/**
 * REGLAS DE EJEMPLO, NO APROBADAS. Existen solo para probar el ejecutor y
 * viven en el archivo de pruebas a propósito: nada clínico sin aprobar entra a
 * `src/`. Los umbrales están tomados del diseño cuando el diseño los nombra, y
 * son ilustrativos donde no.
 */
const BASE: BaseDeReglas = {
  alarmas: [
    {
      id: 'ideacion_suicida',
      nombreClinico: 'Ideación suicida',
      cuando: { op: 'presente', hallazgo: 'ideacion_suicida' },
      escalaA: 'urgencias',
      severidad: 'critica',
      fuente,
      aprobadoPor,
    },
    {
      id: 'fiebre_lactante',
      nombreClinico: 'Fiebre en el menor de tres meses',
      cuando: {
        op: 'todas',
        de: [
          { op: '<', hallazgo: 'edad_meses', valor: 3, temporalidad: 'antecedente' },
          { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
        ],
      },
      escalaA: 'urgencias',
      severidad: 'critica',
      fuente,
      aprobadoPor,
    },
  ],
  sindromes: [
    {
      id: 'dificultad_respiratoria',
      nombreClinico: 'Síndrome de dificultad respiratoria',
      sistema: 'respiratorio',
      criterios: {
        op: 'todas',
        de: [
          { op: 'presente', hallazgo: 'disnea' },
          {
            op: 'alMenos',
            n: 1,
            de: [
              { op: 'presente', hallazgo: 'palpitaciones' },
              { op: 'presente', hallazgo: 'sudoracion' },
              { op: 'presente', hallazgo: 'boca_seca' },
              { op: 'presente', hallazgo: 'dolor_toracico' },
            ],
          },
        ],
      },
      piso: 'consulta_prioritaria',
      explicacionLlana: 'lo que me cuentas compromete tu respiración y necesita valoración hoy',
      fuente,
      aprobadoPor,
    },
  ],
  escalas: [
    {
      id: 'riesgo_cv',
      nombreClinico: 'Riesgo cardiovascular',
      variables: ['edad_meses', 'tabaquismo', 'imc'],
      fuente,
      aprobadoPor,
    },
  ],
  activadores: [
    {
      id: 'compromiso_neurologico_lumbar',
      sospecha: 'Compromiso neurológico lumbar',
      disparadores: { op: 'presente', hallazgo: 'debilidad_piernas' },
      prioridad: 'alta',
      amenazaVidaAguda: true,
      nivelMinimo: 'urgencias',
      fuente,
      aprobadoPor,
    },
    {
      id: 'dolor_no_mecanico',
      sospecha: 'Dolor lumbar no mecánico',
      disparadores: {
        op: 'todas',
        de: [
          { op: 'presente', hallazgo: 'impacto_nocturno' },
          { op: '==', hallazgo: 'patron_temporal', valor: 'continuo' },
        ],
      },
      prioridad: 'alta',
      nivelMinimo: 'consulta_prioritaria',
      explicacionesComunes: [
        {
          id: 'aumento_de_peso',
          nombreClinico: 'Aumento de peso progresivo',
          frecuencia: 'alta',
          cuando: { op: '==', hallazgo: 'cambio_de_peso', valor: 'aumento' },
        },
      ],
      fuente,
      aprobadoPor,
    },
    {
      id: 'cardiovascular_en_metabolico',
      sospecha: 'Enfermedad coronaria en trastorno metabólico',
      requisitos: { op: '>=', hallazgo: 'imc', valor: 30, temporalidad: 'antecedente' },
      disparadores: { op: 'presente', hallazgo: 'dolor_epigastrico' },
      // Relajados por atipia: la ausencia del signo típico no descarta la
      // sospecha cuando un antecedente predice que no se verá como en el libro.
      disparadoresRelajados: {
        op: 'alguna',
        de: [
          { op: 'presente', hallazgo: 'dolor_epigastrico' },
          { op: 'presente', hallazgo: 'disnea_de_esfuerzo' },
        ],
      },
      prioridad: 'media',
      amenazaVidaAguda: true,
      nivelMinimo: 'consulta_prioritaria',
      escalas: ['riesgo_cv'],
      fuente,
      aprobadoPor,
    },
  ],
  susceptibilidades: [
    {
      id: 'obesidad',
      nombreClinico: 'Obesidad',
      cuando: { op: '>=', hallazgo: 'imc', valor: 30, temporalidad: 'antecedente' },
      eleva: ['cardiovascular_en_metabolico'],
      relaja: ['cardiovascular_en_metabolico'],
      fuente,
      aprobadoPor,
    },
  ],
  arboles: [
    {
      id: 'dolor_lumbar',
      motivo: 'dolor de espalda',
      raiz: 'mecanismo',
      adelanta: ['sintomas_acompanantes'],
      nodos: [
        {
          id: 'mecanismo',
          llena: 'mecanismo',
          ramas: [
            { cuando: { op: '==', hallazgo: 'mecanismo', valor: 'traumatico' }, ir: 'trauma' },
            { cuando: { op: 'en', hallazgo: 'mecanismo', valores: ['esfuerzo', 'otro'] }, ir: 'tiempo' },
          ],
        },
        {
          // Todo lo que exija mirar una lesión sale del alcance de Hilda.
          id: 'trauma',
          llena: 'localizacion',
          exigeInstrumento: true,
        },
        {
          id: 'tiempo',
          llena: 'dias_de_evolucion',
          ramas: [
            { cuando: { op: '>=', hallazgo: 'dias_de_evolucion', valor: 42 }, ir: 'persistente' },
            { cuando: { op: '<', hallazgo: 'dias_de_evolucion', valor: 42 }, ir: 'reciente' },
          ],
        },
        {
          id: 'reciente',
          desenlace: {
            nivel: 'casa',
            paraElPaciente: {
              explicacionProbable: 'por lo que me cuentas, tu espalda está sobrecargada',
              noSeResuelveAqui: 'si no mejora, un médico tiene que examinarte',
              planDelIntervalo: ['mantente activo y evita el reposo en cama'],
            },
            paraElMedico: {
              hipotesis: 'dolor lumbar mecánico por sobrecarga',
              loQueQuedaSinValorar: ['examen físico'],
            },
            aprobadoPor,
          },
        },
        {
          id: 'persistente',
          desenlace: {
            nivel: 'consulta_general',
            paraElPaciente: {
              explicacionProbable: 'el peso que has ganado está sobrecargando tu espalda',
              noSeResuelveAqui: 'un médico tiene que examinarte y decidir si hacen falta estudios',
              planDelIntervalo: ['mantente activo y evita el reposo en cama'],
            },
            paraElMedico: {
              hipotesis: 'dolor lumbar de un mes, curso progresivo',
              loQueQuedaSinValorar: ['examen físico', 'imágenes'],
            },
            aprobadoPor,
          },
        },
      ],
    },
  ],
};

// ── Ayudas ──

const hall = (
  id: string,
  estado: HallazgoRegistrado['estado'],
  extra: Partial<HallazgoRegistrado> = {}
): HallazgoRegistrado => ({
  id,
  estado,
  procedencia: 'relato',
  frase: `frase de ${id}`,
  fecha: HOY,
  temporalidad: 'actual',
  ...extra,
});

/** Una ficha con IMC de 31: peso 90, talla 170. */
const fichaObesa = (): Ficha => {
  const conPeso = fichaDesdePerfil({ id: 'i1', weight: 90, dateOfBirth: '1985-06-20' }, HOY);
  const r = registrarReferido(conPeso, 'talla', { fecha: HOY, informante: 'paciente', estado: 'positivo', valor: 170 });
  if (!r.ok) throw new Error(r.motivo);
  return r.ficha;
};

const estado = (e: Partial<EstadoConsulta> = {}): EstadoConsulta => ({
  ficha: fichaVacia('i1'),
  hallazgos: [],
  hoy: HOY,
  ...e,
});

describe('La base de ejemplo está bien formada', () => {
  it('pasa el revisor', () => {
    expect(revisarBase(BASE)).toEqual([]);
  });
});

describe('Las alarmas van por encima de todo', () => {
  it('una alarma disparada para las preguntas y escala', () => {
    const r = evaluarTurno(
      estado({
        hallazgos: [hall('ideacion_suicida', 'positivo')],
        arbolActivo: 'dolor_lumbar',
      }),
      BASE
    );
    expect(r.alarmas.map((a) => a.alarma.id)).toEqual(['ideacion_suicida']);
    expect(r.piso).toBe('urgencias');
    expect(r.siguiente.tipo).toBe('concluir');
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.razon).toBe('alarma');
  });

  it('la alarma trae la frase de la que salió, no un resumen', () => {
    const r = evaluarTurno(estado({ hallazgos: [hall('ideacion_suicida', 'positivo')] }), BASE);
    expect(r.alarmas[0].evidencia).toEqual(['frase de ideacion_suicida']);
  });

  it('parar de preguntar no es descartar: la cola sigue ahí', () => {
    // No se excluye, se prioriza. Lo que quedaba pendiente va al informe.
    const r = evaluarTurno(
      estado({ hallazgos: [hall('ideacion_suicida', 'positivo')], arbolActivo: 'dolor_lumbar' }),
      BASE
    );
    expect(r.siguiente.cola.length).toBeGreaterThan(0);
  });

  it('un antecedente negado no apaga la alarma', () => {
    // Bastaría un "yo no tengo nada" para desactivar una señal de peligro.
    let ficha = fichaVacia('bebe');
    for (const id of ['patologicos', 'quirurgicos', 'alergicos', 'tabaquismo']) {
      const r = registrarReferido(ficha, id, { fecha: HOY, informante: 'cuidador', estado: 'negado' });
      if (!r.ok) throw new Error(r.motivo);
      ficha = r.ficha;
    }
    const nacio = registrarReferido(ficha, 'fecha_de_nacimiento', {
      fecha: HOY,
      informante: 'cuidador',
      estado: 'positivo',
      valor: '2026-10-01',
    });
    if (!nacio.ok) throw new Error(nacio.motivo);

    const r = evaluarTurno(
      estado({ ficha: nacio.ficha, hallazgos: [hall('fiebre_medida', 'positivo', { valor: 38.5 })] }),
      BASE
    );
    expect(r.alarmas.map((a) => a.alarma.id)).toEqual(['fiebre_lactante']);
    expect(r.piso).toBe('urgencias');
  });

  it('una alarma sin asidero no pregunta nada: detecta, no interroga', () => {
    // Sin esto, cualquiera que entre por una uña encarnada recibiría de
    // primeras la pregunta por ideación suicida, porque la alarma "no se puede
    // descartar". El tamizaje que sí hay que hacer siempre es del árbol (§8).
    const r = evaluarTurno(estado({ arbolActivo: 'dolor_lumbar' }), BASE);
    expect(r.siguiente.cola.some((p) => p.prioridad === 'alarma')).toBe(false);
  });

  it('lo que una alarma no puede descartar es la primera pregunta de la cola', () => {
    const r = evaluarTurno(
      estado({
        ficha: fichaDesdePerfil({ id: 'bebe', dateOfBirth: '2026-10-01' }, HOY),
        arbolActivo: 'dolor_lumbar',
      }),
      BASE
    );
    expect(r.siguiente.tipo).toBe('preguntar');
    if (r.siguiente.tipo !== 'preguntar') return;
    expect(r.siguiente.pregunta.hallazgo).toBe('fiebre_medida');
    expect(r.siguiente.pregunta.prioridad).toBe('alarma');
  });
});

describe('El síndrome fija el piso aunque la sospecha falle', () => {
  it('disnea con un acompañante compromete el sistema y sube el piso', () => {
    const r = evaluarTurno(
      estado({ hallazgos: [hall('disnea', 'positivo'), hall('palpitaciones', 'positivo')] }),
      BASE
    );
    expect(r.sindromes.map((s) => s.id)).toEqual(['dificultad_respiratoria']);
    // Ninguna sospecha concreta se levantó, y el piso igual subió.
    expect(r.sospechas).toEqual([]);
    expect(r.piso).toBe('consulta_prioritaria');
  });

  it('disnea sola es un síntoma, no un síndrome', () => {
    const r = evaluarTurno(estado({ hallazgos: [hall('disnea', 'positivo')] }), BASE);
    expect(r.sindromes).toEqual([]);
  });

  it('el piso del síndrome gana al desenlace del árbol, que solo propone', () => {
    const r = evaluarTurno(
      estado({
        arbolActivo: 'dolor_lumbar',
        hallazgos: [
          hall('mecanismo', 'positivo', { valor: 'esfuerzo' }),
          hall('dias_de_evolucion', 'positivo', { valor: 10 }),
          hall('disnea', 'positivo'),
          hall('dolor_toracico', 'positivo'),
        ],
      }),
      BASE
    );
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.desenlace?.nivel).toBe('casa');
    expect(r.piso).toBe('consulta_prioritaria');
  });
});

describe('Lo común se pregunta antes que lo raro', () => {
  const nocturno = [
    hall('impacto_nocturno', 'positivo'),
    hall('patron_temporal', 'positivo', { valor: 'continuo' }),
  ];

  it('antes de nombrar lo grave, pregunta lo que lo explicaría sin drama', () => {
    // El caso del 28-oct: un dolor que despierta de noche parece inflamatorio,
    // y la explicación más frecuente es el aumento de peso progresivo.
    const r = evaluarTurno(estado({ hallazgos: nocturno, arbolActivo: 'dolor_lumbar' }), BASE);
    expect(r.siguiente.tipo).toBe('preguntar');
    if (r.siguiente.tipo !== 'preguntar') return;
    expect(r.siguiente.pregunta.hallazgo).toBe('cambio_de_peso');
    expect(r.siguiente.pregunta.porque).toContain('lo común primero');
  });

  it('la explicación común baja la sospecha, y no la descarta', () => {
    const r = evaluarTurno(
      estado({ hallazgos: [...nocturno, hall('cambio_de_peso', 'positivo', { valor: 'aumento' })] }),
      BASE
    );
    const sospecha = r.sospechas.find((s) => s.activador.id === 'dolor_no_mecanico');
    expect(sospecha).toBeDefined();
    expect(sospecha?.prioridad).toBe('media');
    expect(sospecha?.bajadaPor).toEqual(['aumento_de_peso']);
    // Y el piso que fijaba sigue fijado: bajar la prioridad no baja el nivel.
    expect(r.piso).toBe('consulta_prioritaria');
  });

  it('sin la explicación común, la sospecha conserva su prioridad', () => {
    const r = evaluarTurno(
      estado({ hallazgos: [...nocturno, hall('cambio_de_peso', 'positivo', { valor: 'sin_cambio' })] }),
      BASE
    );
    expect(r.sospechas.find((s) => s.activador.id === 'dolor_no_mecanico')?.prioridad).toBe('alta');
  });
});

describe('Lo que la ficha predice y lo que compuerta', () => {
  it('sin el requisito cumplido, el activador no levanta nada ni pregunta nada', () => {
    // Fiebre con molestia en el pecho, sin ningún factor de riesgo, casi siempre
    // es otra cosa. Sin esa compuerta Hilda es un cuestionario alarmista.
    const delgado = fichaDesdePerfil({ id: 'i1', weight: 60 }, HOY);
    const conTalla = registrarReferido(delgado, 'talla', {
      fecha: HOY,
      informante: 'paciente',
      estado: 'positivo',
      valor: 175,
    });
    if (!conTalla.ok) throw new Error(conTalla.motivo);
    const r = evaluarTurno(
      estado({ ficha: conTalla.ficha, hallazgos: [hall('dolor_epigastrico', 'positivo')] }),
      BASE
    );
    expect(r.sospechas.map((s) => s.activador.id)).not.toContain('cardiovascular_en_metabolico');
    expect(r.siguiente.cola.some((p) => p.porque.includes('Enfermedad coronaria'))).toBe(false);
  });

  it('un activador sin asidero no interroga, aunque no tenga requisitos', () => {
    // No tener requisitos no es una licencia para preguntar: es lo contrario.
    const r = evaluarTurno(estado({ arbolActivo: 'dolor_lumbar' }), BASE);
    expect(r.siguiente.cola.map((p) => p.hallazgo)).not.toContain('debilidad_piernas');
  });

  it('con los requisitos cumplidos pregunta aunque no haya ningún síntoma', () => {
    // Es la pre-activación del perfil de susceptibilidad: la ficha predice, así
    // que se pregunta por ello antes y con menos exigencia.
    const r = evaluarTurno(estado({ ficha: fichaObesa() }), BASE);
    expect(r.siguiente.cola.map((p) => p.hallazgo)).toContain('dolor_epigastrico');
  });

  it('un derivado no se pregunta: se preguntan sus insumos', () => {
    // El requisito del activador mira el IMC. Preguntarle a alguien su índice
    // de masa corporal no tiene sentido; lo que falta es el peso y la talla.
    const r = evaluarTurno(
      estado({ hallazgos: [hall('dolor_epigastrico', 'positivo')] }),
      {
        ...BASE,
        activadores: BASE.activadores.map((a) =>
          a.id === 'cardiovascular_en_metabolico' ? { ...a, disparadoresRelajados: undefined } : a
        ),
      }
    );
    const ids = r.siguiente.cola.map((p) => p.hallazgo);
    expect(ids).not.toContain('imc');
    expect(ids).toContain('peso');
    expect(ids).toContain('talla');
  });

  it('una susceptibilidad sube la prioridad de la sospecha', () => {
    const r = evaluarTurno(
      estado({ ficha: fichaObesa(), hallazgos: [hall('dolor_epigastrico', 'positivo')] }),
      BASE
    );
    const s = r.sospechas.find((x) => x.activador.id === 'cardiovascular_en_metabolico');
    expect(s?.activador.prioridad).toBe('media');
    expect(s?.prioridad).toBe('alta');
    expect(s?.elevadaPor).toEqual(['obesidad']);
  });

  it('la ausencia del signo típico no descarta la sospecha cuando el antecedente predice atipia', () => {
    // Disnea de esfuerzo en vez de dolor epigástrico: con los disparadores
    // normales no dispara; con los relajados, sí.
    const r = evaluarTurno(
      estado({ ficha: fichaObesa(), hallazgos: [hall('disnea_de_esfuerzo', 'positivo')] }),
      BASE
    );
    const s = r.sospechas.find((x) => x.activador.id === 'cardiovascular_en_metabolico');
    expect(s).toBeDefined();
    expect(s?.relajadaPor).toEqual(['obesidad']);

    const sinSusceptibilidad = evaluarTurno(
      estado({ ficha: fichaObesa(), hallazgos: [hall('disnea_de_esfuerzo', 'positivo')] }),
      { ...BASE, susceptibilidades: [] }
    );
    expect(sinSusceptibilidad.sospechas.map((x) => x.activador.id)).not.toContain(
      'cardiovascular_en_metabolico'
    );
  });
});

describe('Las escalas: completas o no se calculan', () => {
  it('dice qué falta en vez de dar un puntaje a medias', () => {
    const r = evaluarTurno(
      estado({ ficha: fichaObesa(), hallazgos: [hall('dolor_epigastrico', 'positivo')] }),
      BASE
    );
    const escala = r.escalasIncompletas.find((e) => e.escala.id === 'riesgo_cv');
    expect(escala?.faltan).toEqual(['tabaquismo']);
    expect(r.traza.some((t) => t.includes('escala "riesgo_cv" incompleta'))).toBe(true);
  });

  it('una escala que nadie pidió no genera preguntas', () => {
    const r = evaluarTurno(estado({ hallazgos: [hall('disnea', 'positivo')] }), BASE);
    expect(r.escalasIncompletas).toEqual([]);
  });
});

describe('El orden de prioridad de la sección 7', () => {
  it('pone las preguntas en el orden del médico, y no descarta ninguna', () => {
    // Estado armado para que los cinco niveles de prioridad tengan algo
    // pendiente a la vez. No es un paciente verosímil —un lactante con IMC de
    // 31 no existe—: es el caso que ejercita el orden completo.
    let ficha = fichaDesdePerfil({ id: 'i1', weight: 90, dateOfBirth: '2026-10-01' }, HOY);
    const conTalla = registrarReferido(ficha, 'talla', {
      fecha: HOY,
      informante: 'paciente',
      estado: 'positivo',
      valor: 170,
    });
    if (!conTalla.ok) throw new Error(conTalla.motivo);
    ficha = conTalla.ficha;

    const r = evaluarTurno(
      estado({
        ficha,
        arbolActivo: 'dolor_lumbar',
        // Disnea de esfuerzo levanta la sospecha de vida aguda por atipia, y el
        // dolor nocturno continuo levanta la que no amenaza la vida.
        hallazgos: [
          hall('disnea_de_esfuerzo', 'positivo'),
          hall('impacto_nocturno', 'positivo'),
          hall('patron_temporal', 'positivo', { valor: 'continuo' }),
        ],
        antecedentesCriticos: ['quirurgicos'],
      }),
      BASE
    );

    const orden = r.siguiente.cola.map((p) => PRIORIDADES.indexOf(p.prioridad));
    expect([...orden]).toEqual([...orden].sort((a, b) => a - b));
    const tiers = new Set(r.siguiente.cola.map((p) => p.prioridad));
    expect(tiers).toContain('alarma');
    expect(tiers).toContain('escala');
    expect(tiers).toContain('sospecha');
    expect(tiers).toContain('arbol');
    expect(tiers).toContain('antecedente_critico');
  });

  it('una sola pregunta por turno, y el resto espera su turno', () => {
    const r = evaluarTurno(
      estado({ arbolActivo: 'dolor_lumbar', antecedentesCriticos: ['quirurgicos'] }),
      BASE
    );
    expect(r.siguiente.tipo).toBe('preguntar');
    if (r.siguiente.tipo !== 'preguntar') return;
    expect(r.siguiente.pregunta).toEqual(r.siguiente.cola[0]);
    expect(r.siguiente.cola.length).toBeGreaterThan(1);
  });

  it('no pregunta dos veces el mismo hallazgo', () => {
    const r = evaluarTurno(
      estado({ ficha: fichaObesa(), arbolActivo: 'dolor_lumbar', antecedentesCriticos: ['talla'] }),
      BASE
    );
    const ids = r.siguiente.cola.map((p) => p.hallazgo);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('Cuándo para', () => {
  it('por desenlace, cuando el árbol llega a un nodo terminal', () => {
    const r = evaluarTurno(
      estado({
        arbolActivo: 'dolor_lumbar',
        hallazgos: [
          hall('mecanismo', 'positivo', { valor: 'otro' }),
          hall('dias_de_evolucion', 'positivo', { valor: 45 }),
        ],
      }),
      BASE
    );
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.razon).toBe('desenlace');
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.desenlace?.nivel).toBe('consulta_general');
    expect(r.piso).toBe('consulta_general');
  });

  it('el desenlace dice qué está pasando, no solo a dónde ir', () => {
    // Encaminar no es orientar: una orientación que dice "esto hay que
    // examinarlo" sin decir qué pasa deja a la persona alarmada y sin entender.
    const r = evaluarTurno(
      estado({
        arbolActivo: 'dolor_lumbar',
        hallazgos: [
          hall('mecanismo', 'positivo', { valor: 'otro' }),
          hall('dias_de_evolucion', 'positivo', { valor: 45 }),
        ],
      }),
      BASE
    );
    const d = r.siguiente.tipo === 'concluir' ? r.siguiente.desenlace : undefined;
    expect(d?.paraElPaciente.explicacionProbable).toContain('sobrecargando tu espalda');
    expect(d?.paraElPaciente.planDelIntervalo.length).toBeGreaterThan(0);
    expect(d?.paraElMedico.loQueQuedaSinValorar).toContain('imágenes');
  });

  it('por suficiencia, cuando el siguiente paso exige algo que Hilda no puede obtener', () => {
    const r = evaluarTurno(
      estado({ arbolActivo: 'dolor_lumbar', hallazgos: [hall('mecanismo', 'positivo', { valor: 'traumatico' })] }),
      BASE
    );
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.razon).toBe('suficiencia');
    expect(r.traza.some((t) => t.includes('exige un instrumento'))).toBe(true);
  });

  it('por presupuesto: sin tope, un grafo entrelazado interroga para siempre', () => {
    const r = evaluarTurno(
      estado({ arbolActivo: 'dolor_lumbar', preguntasHechas: PRESUPUESTO_POR_DEFECTO }),
      BASE
    );
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.razon).toBe('presupuesto');
  });

  it('cuando no queda nada por preguntar', () => {
    const r = evaluarTurno(estado({ hallazgos: [hall('disnea', 'negado')] }), BASE);
    expect(r.siguiente.tipo === 'concluir' && r.siguiente.razon).toBe('nada_que_preguntar');
    expect(r.piso).toBe('casa');
  });
});

describe('El arnés de bandas', () => {
  const caso = (e: Partial<CasoDelArnes>): CasoDelArnes => ({
    id: 'caso-1',
    resumen: 'caso de ejemplo',
    estado: estado(),
    nivelRecomendado: 'consulta_general',
    ...e,
  });

  it('el desenlace esperado es una banda, no un valor', () => {
    // Del 28-oct: el médico escogió consulta_general y añadió que
    // consulta_prioritaria "no me disgusta, estaría bien para ser más precavidos".
    const c = caso({ bandaAceptable: ['consulta_prioritaria'] });
    expect(veredicto('consulta_general', c)).toBe('correcto');
    expect(veredicto('consulta_prioritaria', c)).toBe('correcto');
    expect(veredicto('casa', c)).toBe('falso_negativo');
    expect(veredicto('urgencias', c)).toBe('derivacion_innecesaria');
  });

  it('sin banda declarada, la banda es el nivel recomendado', () => {
    const c = caso({});
    expect(veredicto('consulta_general', c)).toBe('correcto');
    expect(veredicto('consulta_prioritaria', c)).toBe('derivacion_innecesaria');
  });

  it('una alarma esperada que no se dispara es falso negativo, aunque el piso cuadre', () => {
    // El piso correcto por casualidad no es seguridad: la próxima vez que
    // cambie una regla se cae.
    const resultados = correrArnes(
      [
        caso({
          id: 'sindrome-sin-alarma',
          estado: estado({ hallazgos: [hall('disnea', 'positivo'), hall('dolor_toracico', 'positivo')] }),
          nivelRecomendado: 'consulta_prioritaria',
          alarmasEsperadas: ['ideacion_suicida'],
        }),
      ],
      BASE
    );
    expect(resultados[0].obtenido).toBe('consulta_prioritaria');
    expect(resultados[0].alarmasPerdidas).toEqual(['ideacion_suicida']);
    expect(resultados[0].veredicto).toBe('falso_negativo');
  });

  it('mide las tres cosas por separado, sin un porcentaje que las esconda', () => {
    const resultados = correrArnes(
      [
        caso({
          id: 'muy-bajo',
          estado: estado({ hallazgos: [hall('disnea', 'negado')] }),
          nivelRecomendado: 'consulta_prioritaria',
        }),
        caso({
          id: 'justo',
          estado: estado({ hallazgos: [hall('disnea', 'positivo'), hall('sudoracion', 'positivo')] }),
          nivelRecomendado: 'consulta_prioritaria',
        }),
        caso({
          id: 'de-mas',
          estado: estado({ hallazgos: [hall('ideacion_suicida', 'positivo')] }),
          nivelRecomendado: 'casa',
        }),
      ],
      BASE
    );
    const m = medir(resultados);
    expect(m).toMatchObject({
      total: 3,
      falsosNegativos: 1,
      correctos: 1,
      derivacionesInnecesarias: 1,
      casosConFalsoNegativo: ['muy-bajo'],
    });
  });
});
