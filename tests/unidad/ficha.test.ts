import { describe, expect, it } from 'vitest';
import {
  type Alergia,
  type Ficha,
  ANTECEDENTES_PERTINENTES,
  VIGENCIA_POR_DEFECTO,
  camposAPreguntar,
  camposDelCurso,
  capaVigente,
  caracterizacion,
  debeAdvertir,
  diasEntre,
  edadEnMeses,
  estadoVigente,
  estaValidado,
  faltanAntecedentesPertinentes,
  faltanDatosDelRegistro,
  fechaDeHoy,
  fenotipoPeligroso,
  fichaDesdePerfil,
  fichaVacia,
  hallazgosDeLaFicha,
  hayQuePreguntar,
  huecosDeLaFicha,
  incorporarHallazgos,
  registrarReferido,
  validar,
} from '@/lib/ficha';
import { registrar } from '@/lib/hallazgos';

const HOY = '2026-11-08';

const escribir = (ficha: Ficha, id: string, capa: Parameters<typeof registrarReferido>[2]): Ficha => {
  const r = registrarReferido(ficha, id, capa);
  if (!r.ok) throw new Error(`se esperaba una escritura válida: ${r.motivo}`);
  return r.ficha;
};

const referido = { fecha: HOY, informante: 'paciente' as const };

describe('Un negativo es un registro; un campo vacío no es nada', () => {
  it('un campo que nadie tocó es no_preguntado, nunca negado', () => {
    const ficha = fichaVacia('integrante-1');
    expect(estadoVigente(ficha, 'alergicos')).toBe('no_preguntado');
  });

  it('un negativo guarda quién lo dijo y cuándo', () => {
    const ficha = escribir(fichaVacia('i1'), 'tabaquismo', { ...referido, estado: 'negado' });
    const capa = capaVigente(ficha.campos['tabaquismo']);
    expect(capa?.estado).toBe('negado');
    expect(capa?.informante).toBe('paciente');
    expect(capa?.fecha).toBe(HOY);
  });

  it('no_preguntado no se escribe: es la ausencia del campo', () => {
    const r = registrarReferido(fichaVacia('i1'), 'tabaquismo', { ...referido, estado: 'no_preguntado' });
    expect(r.ok).toBe(false);
  });

  it('un desconocido sin razón no entra', () => {
    const r = registrarReferido(fichaVacia('i1'), 'peso', { ...referido, estado: 'desconocido' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('sin decir por qué');
  });

  it('un campo que no existe en el catálogo no entra', () => {
    const r = registrarReferido(fichaVacia('i1'), 'signo_zodiacal', { ...referido, estado: 'positivo', valor: 'libra' });
    expect(r.ok).toBe(false);
  });

  it('un positivo puede llevar magnitud: un quiste de casi un litro es otro objeto clínico', () => {
    const ficha = escribir(fichaVacia('i1'), 'patologicos', {
      ...referido,
      estado: 'positivo',
      detalle: 'quiste renal',
      magnitud: { valor: 950, unidad: 'ml', fecha: '2026-10-20' },
      comoLoSupo: 'diagnostico_medico',
    });
    expect(capaVigente(ficha.campos['patologicos'])?.magnitud?.valor).toBe(950);
  });
});

describe('Lo que valida el médico no borra lo que dijo la persona', () => {
  const base = escribir(fichaVacia('i1'), 'alergicos', {
    ...referido,
    estado: 'positivo',
    detalle: 'ibuprofeno',
    comoLoSupo: 'el_lo_cree',
  });

  it('el validado manda y el referido queda como prueba de la pregunta', () => {
    const r = validar(base, 'alergicos', {
      estado: 'negado',
      detalle: 'intolerancia, no alergia',
      fecha: '2026-11-08',
      medico: { nombre: 'Médico responsable', registroProfesional: 'RM-12345' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(estadoVigente(r.ficha, 'alergicos')).toBe('negado');
    expect(r.ficha.campos['alergicos'].referido?.estado).toBe('positivo');
    expect(estaValidado(r.ficha, 'alergicos')).toBe(true);
  });

  it('validar exige nombre y registro profesional', () => {
    const r = validar(base, 'alergicos', {
      estado: 'negado',
      fecha: HOY,
      medico: { nombre: 'Médico responsable', registroProfesional: '' },
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('registro profesional');
  });

  it('un médico no escribe por el camino del referido', () => {
    const r = registrarReferido(base, 'alergicos', { fecha: HOY, informante: 'medico', estado: 'negado' });
    expect(r.ok).toBe(false);
  });
});

describe('Cuándo se vuelve a preguntar', () => {
  const vigencia = VIGENCIA_POR_DEFECTO;

  it('los números de vigencia están marcados como pendientes del criterio del médico', () => {
    // No son clínicos todavía: están en un solo sitio para que se vean.
    expect(VIGENCIA_POR_DEFECTO.pendienteDeCriterioDelMedico).toBe(true);
  });

  it('lo que nunca se preguntó, se pregunta', () => {
    expect(hayQuePreguntar(fichaVacia('i1'), 'peso', { hoy: HOY }).preguntar).toBe(true);
  });

  it('un positivo fresco no se vuelve a preguntar; uno viejo sí', () => {
    const fresco = escribir(fichaVacia('i1'), 'patologicos', { ...referido, estado: 'positivo', detalle: 'hipertensión' });
    expect(hayQuePreguntar(fresco, 'patologicos', { hoy: HOY, critico: true }).preguntar).toBe(false);

    const viejo = escribir(fichaVacia('i1'), 'patologicos', {
      fecha: '2024-01-01',
      informante: 'paciente',
      estado: 'positivo',
      detalle: 'hipertensión',
    });
    expect(hayQuePreguntar(viejo, 'patologicos', { hoy: HOY, critico: true }).preguntar).toBe(true);
  });

  it('un negativo no se repregunta salvo que el motivo de hoy lo vuelva crítico', () => {
    // "Sin transfusiones" es irrelevante para una uña encarnada y decisivo
    // frente a una anemia.
    const antiguo = escribir(fichaVacia('i1'), 'quirurgicos', {
      fecha: '2020-01-01',
      informante: 'paciente',
      estado: 'negado',
    });
    expect(hayQuePreguntar(antiguo, 'quirurgicos', { hoy: HOY, critico: false }).preguntar).toBe(false);
    expect(hayQuePreguntar(antiguo, 'quirurgicos', { hoy: HOY, critico: true }).preguntar).toBe(true);
  });

  it('lo que caracterizó un médico aguanta más que lo referido', () => {
    const haceUnAnio = '2026-01-15';
    const referidoViejo = escribir(fichaVacia('i1'), 'alergicos', {
      fecha: haceUnAnio,
      informante: 'paciente',
      estado: 'positivo',
      detalle: 'ibuprofeno',
    });
    expect(diasEntre(haceUnAnio, HOY)).toBeGreaterThan(vigencia.positivoReferido);
    expect(hayQuePreguntar(referidoViejo, 'alergicos', { hoy: HOY, critico: true }).preguntar).toBe(true);

    const validado = validar(referidoViejo, 'alergicos', {
      estado: 'positivo',
      detalle: 'AINE',
      fecha: haceUnAnio,
      medico: { nombre: 'Médico responsable', registroProfesional: 'RM-12345' },
    });
    expect(validado.ok).toBe(true);
    if (!validado.ok) return;
    // Hilda no le pregunta a alguien si es alérgico al ibuprofeno cuando un
    // médico ya lo caracterizó.
    expect(hayQuePreguntar(validado.ficha, 'alergicos', { hoy: HOY, critico: true }).preguntar).toBe(false);
  });

  it('en una consulta normal eso es cero o una pregunta, no quince', () => {
    let ficha = fichaVacia('i1');
    for (const id of ['patologicos', 'quirurgicos', 'alergicos', 'farmacologicos', 'tabaquismo']) {
      ficha = escribir(ficha, id, { ...referido, estado: 'negado' });
    }
    const relevantes = [
      { id: 'patologicos', critico: true },
      { id: 'quirurgicos' },
      { id: 'alergicos' },
      { id: 'farmacologicos' },
      { id: 'tabaquismo' },
    ];
    expect(camposAPreguntar(ficha, relevantes, HOY)).toEqual([]);
  });
});

describe('Las alergias se caracterizan, no se reclasifican', () => {
  const ibuprofeno: Alergia = { sustancia: 'ibuprofeno', manifestaciones: ['somnolencia'] };

  it('una alergia sin caracterizar se marca como incompleta', () => {
    expect(caracterizacion(ibuprofeno)).toBe('incompleta');
  });

  it('con las cuatro preguntas contestadas, queda completa', () => {
    expect(
      caracterizacion({
        ...ibuprofeno,
        cuantoDespues: 'minutos',
        queSeHizo: 'suspendio',
        volvioATomarla: 'no',
      })
    ).toBe('completa');
  });

  it('distingue el fenotipo peligroso de una intolerancia', () => {
    expect(fenotipoPeligroso(ibuprofeno)).toBe(false);
    expect(fenotipoPeligroso({ ...ibuprofeno, manifestaciones: ['ahogo_o_silbido'] })).toBe(true);
  });

  it('Hilda advierte igual: caracterizar no debilita la advertencia', () => {
    // Que una reacción no parezca alérgica no descarta el suministro ni lo
    // permite. Eso lo decide el médico, con el paciente al frente.
    expect(debeAdvertir(ibuprofeno)).toBe(true);
    expect(debeAdvertir({ ...ibuprofeno, manifestaciones: [], volvioATomarla: 'si_sin_problema' })).toBe(true);
  });
});

describe('El puente con el perfil que ya existe', () => {
  it('una lista de alergias vacía NO es un negativo', () => {
    // En el perfil de hoy, `allergies: []` quiere decir que nadie llenó el
    // campo. Leerlo como "niega alergias" escribiría miles de afirmaciones que
    // nadie hizo.
    const ficha = fichaDesdePerfil({ id: 'i1', allergies: [] }, HOY);
    expect(estadoVigente(ficha, 'alergicos')).toBe('no_preguntado');
  });

  it('las alergias del perfil entran como positivo y sin caracterizar', () => {
    const ficha = fichaDesdePerfil({ id: 'i1', allergies: ['ibuprofeno', 'penicilina'] }, HOY);
    const capa = capaVigente(ficha.campos['alergicos']);
    expect(capa?.estado).toBe('positivo');
    expect(capa?.alergias).toHaveLength(2);
    expect(capa?.alergias?.every((a) => caracterizacion(a) === 'incompleta')).toBe(true);
  });

  it('el texto libre del perfil no se vuelve antecedentes tipados', () => {
    const ficha = fichaDesdePerfil({ id: 'i1', pathologicalHistory: 'gastritis, colon irritable' }, HOY);
    const capa = capaVigente(ficha.campos['patologicos']);
    expect(capa?.sinEstructurar).toBe(true);
    expect(capa?.detalle).toBe('gastritis, colon irritable');
    // Y por eso no llega al grafo como hallazgo: partirlo sería inferir.
    expect(hallazgosDeLaFicha(ficha, HOY).some((h) => h.id === 'patologicos')).toBe(false);
  });

  it('traduce el sexo del perfil sin deducir nada', () => {
    expect(estadoVigente(fichaDesdePerfil({ id: 'i1', sex: 'female' }, HOY), 'sexo_registrado')).toBe('positivo');
    expect(estadoVigente(fichaDesdePerfil({ id: 'i1' }, HOY), 'sexo_registrado')).toBe('no_preguntado');
  });

  it('un peso ausente o cero no se inventa', () => {
    expect(estadoVigente(fichaDesdePerfil({ id: 'i1', weight: 0 }, HOY), 'peso')).toBe('no_preguntado');
    expect(estadoVigente(fichaDesdePerfil({ id: 'i1', weight: 72 }, HOY), 'peso')).toBe('positivo');
  });
});

describe('Lo que el registro tiene que traer', () => {
  it('sin fecha de nacimiento ni sexo, el registro quedó incompleto', () => {
    // Criterio de Alexander, 8-nov-2026: nombre, edad y antecedentes
    // pertinentes. Son los dos estratificadores de toda la epidemiología.
    expect(faltanDatosDelRegistro(fichaVacia('i1')).sort()).toEqual([
      'fecha_de_nacimiento',
      'sexo_registrado',
    ]);
    const completo = fichaDesdePerfil({ id: 'i1', dateOfBirth: '1985-06-20', sex: 'male' }, HOY);
    expect(faltanDatosDelRegistro(completo)).toEqual([]);
  });

  it('una fecha de nacimiento igual a la del registro está inventada, y no entra', () => {
    // El formulario de hoy escribe `dateOfBirth` = el día del registro y
    // `sex: 'other'`. Con la edad en cero, una alarma de fiebre en el menor de
    // tres meses se dispararía con todos los adultos.
    const inventado = fichaDesdePerfil(
      { id: 'i1', dateOfBirth: HOY, sex: 'other', creadoEl: HOY },
      HOY
    );
    expect(estadoVigente(inventado, 'fecha_de_nacimiento')).toBe('no_preguntado');
    expect(estadoVigente(inventado, 'sexo_registrado')).toBe('no_preguntado');
    expect(hallazgosDeLaFicha(inventado, HOY).some((h) => h.id === 'edad_meses')).toBe(false);
  });

  it('una fecha de nacimiento de verdad sí entra, aunque se sepa cuándo se registró', () => {
    const real = fichaDesdePerfil(
      { id: 'i1', dateOfBirth: '1985-06-20', sex: 'male', creadoEl: HOY },
      HOY
    );
    expect(estadoVigente(real, 'fecha_de_nacimiento')).toBe('positivo');
    expect(estadoVigente(real, 'sexo_registrado')).toBe('positivo');
  });

  it('una fecha de nacimiento con hora no entra: la regla de la casa es AAAA-MM-DD', () => {
    const conHora = fichaDesdePerfil({ id: 'i1', dateOfBirth: '1985-06-20T00:00:00.000Z' }, HOY);
    expect(estadoVigente(conHora, 'fecha_de_nacimiento')).toBe('no_preguntado');
  });

  it('los antecedentes universales faltan hasta que alguien los pregunta', () => {
    expect(faltanAntecedentesPertinentes(fichaVacia('i1'))).toEqual([...ANTECEDENTES_PERTINENTES]);
  });

  it('un negado es una respuesta, no un hueco', () => {
    let ficha = fichaVacia('i1');
    for (const id of ANTECEDENTES_PERTINENTES) {
      const capa: Parameters<typeof registrarReferido>[2] =
        id === 'peso' || id === 'talla'
          ? { ...referido, estado: 'desconocido', razon: 'no se ha pesado ni medido' }
          : { ...referido, estado: 'negado' };
      ficha = escribir(ficha, id, capa);
    }
    expect(faltanAntecedentesPertinentes(ficha)).toEqual([]);
  });
});

describe('Lo que la ficha le entrega al grafo', () => {
  const conPesoYTalla = (): Ficha => {
    let ficha = fichaDesdePerfil({ id: 'i1', weight: 80, dateOfBirth: '1985-06-20' }, HOY);
    ficha = escribir(ficha, 'talla', { ...referido, estado: 'positivo', valor: 170 });
    return ficha;
  };

  it('el IMC sale calculado, y solo con las dos variables', () => {
    const conAmbas = hallazgosDeLaFicha(conPesoYTalla(), HOY);
    const calculado = conAmbas.find((h) => h.id === 'imc');
    expect(calculado?.valor).toBe(27.7);
    expect(calculado?.procedencia).toBe('calculo');

    const soloPeso = hallazgosDeLaFicha(fichaDesdePerfil({ id: 'i1', weight: 80 }, HOY), HOY);
    expect(soloPeso.some((h) => h.id === 'imc')).toBe(false);
  });

  it('los hallazgos de la ficha son antecedentes, no hechos de hoy', () => {
    expect(hallazgosDeLaFicha(conPesoYTalla(), HOY).every((h) => h.temporalidad === 'antecedente')).toBe(true);
  });

  it('la edad en meses sale de la fecha de nacimiento, y no se estima', () => {
    const conEdad = hallazgosDeLaFicha(conPesoYTalla(), HOY);
    expect(conEdad.find((h) => h.id === 'edad_meses')?.valor).toBe(edadEnMeses('1985-06-20', HOY));
    const sinFecha = hallazgosDeLaFicha(fichaDesdePerfil({ id: 'i1' }, HOY), HOY);
    expect(sinFecha.some((h) => h.id === 'edad_meses')).toBe(false);
  });

  it('los huecos de la ficha se pueden nombrar para el informe', () => {
    const huecos = huecosDeLaFicha(fichaDesdePerfil({ id: 'i1', weight: 80 }, HOY));
    expect(huecos).toContain('talla');
    expect(huecos).toContain('alergicos');
    expect(huecos).not.toContain('peso');
  });
});

describe('La ficha tiene tres partes, y la del curso de vida depende de la edad', () => {
  it('la historia perinatal solo aplica en primera infancia', () => {
    expect(camposDelCurso('primera_infancia').map((c) => c.id)).toContain('semanas_al_nacer');
    expect(camposDelCurso('adultez').map((c) => c.id)).not.toContain('semanas_al_nacer');
  });

  it('lo universal aplica en todos los cursos de vida', () => {
    for (const curso of ['primera_infancia', 'adultez', 'vejez'] as const) {
      const ids = camposDelCurso(curso).map((c) => c.id);
      expect(ids).toContain('peso');
      expect(ids).toContain('talla');
      expect(ids).toContain('alergicos');
    }
  });

  it('los huecos se piden por curso de vida, no en abstracto', () => {
    // A un adulto no le falta la historia perinatal; a un lactante sí.
    expect(huecosDeLaFicha(fichaVacia('adulto'), 'adultez')).not.toContain('semanas_al_nacer');
    expect(huecosDeLaFicha(fichaVacia('bebe'), 'primera_infancia')).toContain('semanas_al_nacer');
  });
});

describe('Fechas: texto AAAA-MM-DD, nunca ISO con hora', () => {
  it('fechaDeHoy devuelve el día de Bogotá en el formato de la casa', () => {
    expect(fechaDeHoy()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 3 de la mañana UTC es todavía el día anterior en Bogotá (UTC-5).
    expect(fechaDeHoy(new Date('2026-11-08T03:00:00Z'))).toBe('2026-11-07');
  });

  it('cuenta los días entre dos fechas', () => {
    expect(diasEntre('2026-11-01', '2026-11-08')).toBe(7);
    expect(diasEntre('2026-11-08', '2026-11-01')).toBe(-7);
  });

  it('la edad en meses son meses cumplidos', () => {
    expect(edadEnMeses('2026-08-08', '2026-11-08')).toBe(3);
    expect(edadEnMeses('2026-08-09', '2026-11-08')).toBe(2);
    expect(edadEnMeses(undefined, '2026-11-08')).toBeNull();
    expect(edadEnMeses('2027-01-01', '2026-11-08')).toBeNull();
  });
});

describe('Qué de una consulta entra a la ficha', () => {
  const HOY = '2026-11-09';

  const hallazgo = (extra: Record<string, unknown> = {}) => {
    const registro = registrar({
      id: 'peso',
      estado: 'positivo',
      valor: 72,
      procedencia: 'relato',
      frase: 'peso 72 kilos',
      fecha: HOY,
      temporalidad: 'antecedente',
      ...extra,
    } as any);
    if (!registro.ok) throw new Error(registro.motivo);
    return registro.hallazgo;
  };

  it('un antecedente con campo en la ficha se guarda, y como referido', () => {
    const { ficha, guardados } = incorporarHallazgos(fichaVacia('ana'), [hallazgo()]);

    expect(guardados).toEqual(['peso']);
    expect(ficha.campos.peso.referido).toMatchObject({ estado: 'positivo', valor: 72, informante: 'paciente' });
    // Lo que contó la persona no se asciende a caracterizado por un médico.
    expect(ficha.campos.peso.validado).toBeUndefined();
  });

  it('lo de HOY no entra: es del episodio, no de la historia de la persona', () => {
    // Si entrara, la próxima consulta arrancaría con el dolor de la anterior
    // como si siguiera ahí.
    const { guardados, omitidos } = incorporarHallazgos(fichaVacia('ana'), [
      hallazgo({ temporalidad: 'actual' }),
    ]);
    expect(guardados).toEqual([]);
    expect(omitidos[0].motivo).toContain('episodio de hoy');
  });

  it('un hallazgo que no es antecedente de nadie se queda fuera', () => {
    const localizacion = registrar({
      id: 'localizacion',
      estado: 'positivo',
      valor: 'pecho',
      procedencia: 'relato',
      frase: 'me duele el pecho',
      fecha: HOY,
      temporalidad: 'antecedente',
    });
    if (!localizacion.ok) throw new Error(localizacion.motivo);

    const { guardados, omitidos } = incorporarHallazgos(fichaVacia('ana'), [localizacion.hallazgo]);
    expect(guardados).toEqual([]);
    expect(omitidos[0].motivo).toContain('no tiene campo en la ficha');
  });

  it('lo que caracterizó un médico no lo pisa un relato', () => {
    const conMedico: Ficha = {
      integranteId: 'ana',
      campos: {
        peso: {
          validado: {
            estado: 'positivo',
            valor: 80,
            fecha: '2026-10-01',
            informante: 'medico',
            medico: { nombre: 'A. Ruiz', registroProfesional: '123' },
          },
        },
      },
    };

    const { ficha, guardados, omitidos } = incorporarHallazgos(conMedico, [hallazgo()]);
    expect(guardados).toEqual([]);
    expect(omitidos[0].motivo).toContain('ya lo caracterizó un médico');
    expect(ficha.campos.peso.validado?.valor).toBe(80);
  });
});
