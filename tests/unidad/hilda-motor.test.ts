import { describe, expect, it } from 'vitest';
import { coincidenciasPorPalabraClave } from '@/lib/hilda/alarmas-universales';
import { decidir, MAX_TURNOS_ENTREVISTA, siguienteEstado } from '@/lib/hilda/centinela';
import { validarLectura } from '@/lib/hilda/lector';
import { respuestaDeUrgencia } from '@/lib/hilda/textos-agentes';
import { ESTADO_INICIAL, type Lectura, type ProtocoloActivo } from '@/lib/hilda/tipos';
import { verificarRespuesta } from '@/lib/hilda/verificador';
import { AVISO_URGENCIAS } from '@/lib/textos-chat';

/** Protocolo de juguete con la forma de uno publicado. */
const diarrea: ProtocoloActivo = {
  motivoId: 'diarrea-primera-infancia',
  motivo: 'Diarrea',
  edad: 'menores de 5 años',
  cursoDeVida: 'primera_infancia',
  version: 3,
  signos: [
    { id: 'diarrea-primera-infancia:s1', texto: 'sangre en las heces', origen: 'protocolo', fuente: 'gpc-eda-2013' },
    { id: 'diarrea-primera-infancia:s2', texto: 'no puede beber o vomita todo', origen: 'protocolo', fuente: 'gpc-eda-2013' },
  ],
  preguntas: [{ id: 'diarrea-primera-infancia:p1', texto: '¿Cuántas deposiciones ha tenido hoy?' }],
  frases: [
    { id: 'f1', seccion: 'medidas_en_casa', texto: 'Ofrezca suero oral después de cada deposición.', fuente: 'gpc-eda-2013' },
    { id: 's1', seccion: 'signos_de_alarma', texto: 'sangre en las heces', fuente: 'gpc-eda-2013' },
  ],
  nombresFuentes: { 'gpc-eda-2013': 'Ministerio de Salud y Protección Social 2013' },
};

function lectura(parcial: Partial<Lectura>): Lectura {
  return { motivoId: diarrea.motivoId, edadAnios: 2, signos: [], preguntasRespondidas: [], ...parcial };
}

describe('Palabras clave de los signos universales', () => {
  it('reconocen frases con o sin tildes y mayúsculas', () => {
    expect(coincidenciasPorPalabraClave('Me duele mucho, tengo DOLOR EN EL PECHO')).toEqual(['u-dolor-toracico']);
    expect(coincidenciasPorPalabraClave('mi mamá se desmayó en la cocina')).toEqual(['u-perdida-conciencia']);
    expect(coincidenciasPorPalabraClave('ya no quiero seguir viviendo, quiero morir')).toContain('u-crisis-mental');
    expect(coincidenciasPorPalabraClave('se le hinchó la cara y los labios')).toEqual(['u-alergia-grave']);
  });

  it('no se disparan con una consulta corriente', () => {
    expect(coincidenciasPorPalabraClave('mi niño tiene diarrea desde ayer y está decaído')).toEqual([]);
  });
});

describe('Centinela', () => {
  it('un signo presente deriva a urgencias sin importar la fase', () => {
    const d = decidir({
      estado: { ...ESTADO_INICIAL, turnosDeEntrevista: 1 },
      protocolo: diarrea,
      lectura: lectura({ signos: [{ id: 'diarrea-primera-infancia:s1', estado: 'presente', evidencia: 'tiene sangre', evidenciaVerificada: true }] }),
      coincidencias: [],
    });
    expect(d.fase).toBe('derivacion_urgente');
    expect(d.disparados.map((s) => s.id)).toEqual(['diarrea-primera-infancia:s1']);
  });

  it('un signo presente cuya evidencia no se encontró literal igual deriva (ante la duda, de más)', () => {
    const d = decidir({
      estado: ESTADO_INICIAL,
      protocolo: null,
      lectura: lectura({ motivoId: null, signos: [{ id: 'u-dolor-toracico', estado: 'presente', evidencia: 'algo', evidenciaVerificada: false }] }),
      coincidencias: [],
    });
    expect(d.fase).toBe('derivacion_urgente');
  });

  it('si el lector falla, una palabra clave basta para derivar', () => {
    const d = decidir({ estado: ESTADO_INICIAL, protocolo: diarrea, lectura: null, coincidencias: ['u-crisis-mental'] });
    expect(d.fase).toBe('derivacion_urgente');
    expect(d.razon).toContain('palabra clave');
  });

  it('si el lector niega explícitamente lo que dice la palabra clave, se le cree ("no tengo dolor en el pecho")', () => {
    const d = decidir({
      estado: ESTADO_INICIAL,
      protocolo: null,
      lectura: lectura({ motivoId: null, signos: [{ id: 'u-dolor-toracico', estado: 'ausente', evidencia: 'no tengo dolor en el pecho', evidenciaVerificada: true }] }),
      coincidencias: ['u-dolor-toracico'],
    });
    expect(d.fase).toBe('sin_protocolo');
  });

  it('palabra clave + lector que duda ("posible") deriva sin preguntar', () => {
    const d = decidir({
      estado: ESTADO_INICIAL,
      protocolo: null,
      lectura: lectura({ motivoId: null, signos: [{ id: 'u-alergia-grave', estado: 'posible', evidencia: 'se me hinchó la lengua', evidenciaVerificada: true }] }),
      coincidencias: ['u-alergia-grave'],
    });
    expect(d.fase).toBe('derivacion_urgente');
  });

  it('una palabra clave que el lector no evaluó obliga a aclarar el signo', () => {
    const d = decidir({ estado: ESTADO_INICIAL, protocolo: null, lectura: lectura({ motivoId: null }), coincidencias: ['u-dolor-toracico'] });
    expect(d.fase).toBe('entrevista');
    expect(d.signosPorAclarar.map((s) => s.id)).toEqual(['u-dolor-toracico']);
  });

  it('con protocolo, pregunta lo que falta antes de orientar, y los posibles van primero', () => {
    const d = decidir({
      estado: ESTADO_INICIAL,
      protocolo: diarrea,
      lectura: lectura({ signos: [{ id: 'diarrea-primera-infancia:s2', estado: 'posible', evidencia: 'vomita', evidenciaVerificada: true }] }),
      coincidencias: [],
    });
    expect(d.fase).toBe('entrevista');
    expect(d.signosPorAclarar.map((s) => s.id)).toEqual(['diarrea-primera-infancia:s2', 'diarrea-primera-infancia:s1']);
    expect(d.preguntasPendientes.map((p) => p.id)).toEqual(['diarrea-primera-infancia:p1']);
  });

  it(`orienta después de ${MAX_TURNOS_ENTREVISTA} turnos de preguntas aunque falten datos`, () => {
    const d = decidir({ estado: { ...ESTADO_INICIAL, turnosDeEntrevista: MAX_TURNOS_ENTREVISTA }, protocolo: diarrea, lectura: lectura({}), coincidencias: [] });
    expect(d.fase).toBe('orientacion');
    expect(d.razon).toBe('límite de turnos de entrevista');
  });

  it('orienta cuando todo está aclarado', () => {
    const d = decidir({
      estado: ESTADO_INICIAL,
      protocolo: diarrea,
      lectura: lectura({
        signos: diarrea.signos.map((s) => ({ id: s.id, estado: 'ausente' as const, evidencia: 'no', evidenciaVerificada: true })),
        preguntasRespondidas: ['diarrea-primera-infancia:p1'],
      }),
      coincidencias: [],
    });
    expect(d.fase).toBe('orientacion');
  });

  it('no repite la derivación por el mismo signo, pero el estado recuerda la alarma', () => {
    const presente = lectura({ signos: [{ id: 'diarrea-primera-infancia:s1', estado: 'presente', evidencia: 'sangre', evidenciaVerificada: true }] });
    const primera = decidir({ estado: ESTADO_INICIAL, protocolo: diarrea, lectura: presente, coincidencias: [] });
    const estado = siguienteEstado(ESTADO_INICIAL, primera, presente, diarrea);
    expect(estado.alarmaActivada).toBe(true);

    const segunda = decidir({ estado, protocolo: diarrea, lectura: presente, coincidencias: [] });
    expect(segunda.fase).not.toBe('derivacion_urgente');
    expect(siguienteEstado(estado, segunda, presente, diarrea).alarmaActivada).toBe(true);
  });

  it('un signo presente no se olvida si en otro turno el lector no lo ve', () => {
    const estado = { ...ESTADO_INICIAL, signos: { 'diarrea-primera-infancia:s1': 'presente' as const } };
    const siguiente = siguienteEstado(
      estado,
      { fase: 'orientacion', disparados: [], signosPorAclarar: [], preguntasPendientes: [], razon: '' },
      lectura({ signos: [{ id: 'diarrea-primera-infancia:s1', estado: 'ausente', evidencia: 'no', evidenciaVerificada: true }] }),
      diarrea
    );
    expect(siguiente.signos['diarrea-primera-infancia:s1']).toBe('presente');
  });
});

describe('Validación de la lectura', () => {
  const mensajes = [
    { rol: 'paciente' as const, texto: 'Mi hijo de 2 años tiene diarrea con sangre' },
    { rol: 'hilda' as const, texto: '¿Tiene fiebre alta?' },
  ];

  it('descarta ids inventados o de otro motivo y comprueba que la evidencia sea literal del paciente', () => {
    const l = validarLectura(
      {
        motivo_id: 'diarrea-primera-infancia',
        edad_anios: 2,
        signos: [
          { id: 'diarrea-primera-infancia:s1', estado: 'presente', evidencia: 'diarrea con SANGRE' },
          { id: 'u-dolor-toracico', estado: 'presente', evidencia: 'fiebre alta' },
          { id: 'otro-motivo:s9', estado: 'presente', evidencia: 'x' },
        ],
        preguntas_respondidas: ['diarrea-primera-infancia:p1', 'inventada'],
      },
      mensajes,
      [diarrea]
    );
    expect(l.signos).toEqual([
      { id: 'diarrea-primera-infancia:s1', estado: 'presente', evidencia: 'diarrea con SANGRE', evidenciaVerificada: true },
      // "fiebre alta" lo dijo Hilda, no el paciente.
      { id: 'u-dolor-toracico', estado: 'presente', evidencia: 'fiebre alta', evidenciaVerificada: false },
    ]);
    expect(l.preguntasRespondidas).toEqual(['diarrea-primera-infancia:p1']);
  });

  it('un motivo que no está activo se toma como sin motivo', () => {
    const l = validarLectura({ motivo_id: 'ninguno', edad_anios: null, signos: [], preguntas_respondidas: [] }, mensajes, [diarrea]);
    expect(l.motivoId).toBeNull();
  });
});

describe('Verificador de salida', () => {
  const base = { fase: 'sin_protocolo' as const, alarmaActivada: false, frasesAprobadas: [] };
  const codigos = (respuesta: string, extra: Partial<Parameters<typeof verificarRespuesta>[0]> = {}) =>
    verificarRespuesta({ ...base, ...extra, respuesta }).map((f) => f.codigo);

  it('deja pasar una orientación corriente', () => {
    expect(codigos('Te recomiendo descansar e hidratarte. Si aparece dificultad para respirar, consulta a urgencias.')).toEqual([]);
  });

  it('frena dosis y medicamentos recomendados', () => {
    expect(codigos('Puedes darle 5 ml cada 8 horas.')).toContain('dosis');
    expect(codigos('Tómate un ibuprofeno para el dolor.')).toContain('medicamento');
  });

  it('permite nombrar un medicamento para negarlo o remitir al médico', () => {
    expect(codigos('No le des antibióticos sin fórmula médica.')).toEqual([]);
    expect(codigos('Si necesita acetaminofén, eso debe indicarlo su médico.')).toEqual([]);
  });

  it('permite lo que dice una frase aprobada del protocolo', () => {
    const frasesAprobadas = [{ id: 'f1', seccion: 'medidas_en_casa', texto: 'Ofrezca suero oral después de cada deposición.', fuente: 'x' }];
    expect(codigos('Ofrécele suero oral después de cada deposición.', { frasesAprobadas })).toEqual([]);
  });

  it('frena diagnósticos afirmados, pero no preguntas ni condicionales', () => {
    expect(codigos('Tienes neumonía y debes cuidarte.')).toContain('diagnostico_afirmado');
    expect(codigos('¿Tienes asma?')).toEqual([]);
    expect(codigos('Si tienes diabetes, revisa tu glucosa con tu médico.')).toEqual([]);
    expect(codigos('Te recomiendo, si tienes asma, llevar tu control al día.')).toEqual([]);
  });

  it('frena la norma derogada', () => {
    expect(codigos('Según la Resolución 2654 de 2019...')).toContain('norma_derogada');
  });

  it('en entrevista exige una pregunta y con alarma exige recordar urgencias', () => {
    expect(codigos('Cuéntame más.', { fase: 'entrevista' })).toContain('sin_pregunta');
    expect(codigos('Descansa mucho.', { alarmaActivada: true })).toContain('sin_aviso_urgencias');
    expect(codigos('Mientras llegas a urgencias, mantén la calma.', { alarmaActivada: true })).toEqual([]);
  });
});

describe('Texto de urgencia', () => {
  it('nombra el signo y termina con el aviso aprobado', () => {
    const texto = respuestaDeUrgencia([diarrea.signos[0]]);
    expect(texto).toContain('sangre en las heces');
    expect(texto.endsWith(AVISO_URGENCIAS)).toBe(true);
  });
});
