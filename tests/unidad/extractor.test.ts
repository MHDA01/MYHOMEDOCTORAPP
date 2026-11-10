import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  esquemaDeExtraccion,
  extraerHallazgos,
  frasePropia,
  hallazgosExtraibles,
  interpretar,
  moldeDeLosHallazgos,
  INSTRUCCION_EXTRACTOR,
  type Propuesta,
} from '@/lib/extractor';
import { HALLAZGOS, definicion } from '@/lib/hallazgos';
import { fetchFalso, respuestaGeminiNativa } from '../ayudas';

const HOY = '2026-11-09';

/** Lo que dijo la persona; los turnos de Hilda NO entran aquí a propósito. */
const DICHO = ['Me duele el pecho desde ayer, como un peso encima', 'Peso 72 kilos'];

const unaPropuesta = (extra: Propuesta = {}): Propuesta => ({
  id: 'localizacion',
  estado: 'positivo',
  valor: 'pecho',
  frase: 'Me duele el pecho desde ayer',
  temporalidad: 'actual',
  ...extra,
});

describe('El molde que se le dice al modelo', () => {
  it('nombra todos los hallazgos extraíbles y ninguno más', () => {
    const molde = moldeDeLosHallazgos();
    for (const h of hallazgosExtraibles()) {
      expect(molde).toContain(`- ${h.id} (`);
    }
    const fuera = HALLAZGOS.filter((h) => !hallazgosExtraibles().includes(h));
    for (const h of fuera) {
      expect(molde).not.toContain(`- ${h.id} (`);
    }
    // Se genera del catálogo: una fila nueva no puede quedarse sin molde.
    expect(molde.split('\n')).toHaveLength(hallazgosExtraibles().length);
  });

  it('da las opciones de cada categoría, que el esquema no puede llevar', () => {
    const molde = moldeDeLosHallazgos();
    const caracter = definicion('caracter')!.tipo;
    if (caracter.clase !== 'categoria') throw new Error('caracter dejó de ser categoría');
    for (const opcion of caracter.opciones) {
      expect(molde).toContain(opcion);
    }
  });

  it('da la unidad y el rango de cada medición', () => {
    const molde = moldeDeLosHallazgos();
    expect(molde).toContain('talla (Talla): número en cm (20 a 250)');
    expect(molde).toContain('intensidad (Intensidad referida): número entero de 1 a 10');
    expect(molde).toContain('días');
  });

  it('nunca dice "no se extrae": eso sería un derivado colado en el molde', () => {
    expect(moldeDeLosHallazgos()).not.toContain('no se extrae');
  });

  it('viaja dentro de la instrucción, no en un archivo que nadie manda', () => {
    expect(INSTRUCCION_EXTRACTOR).toContain(moldeDeLosHallazgos());
    expect(INSTRUCCION_EXTRACTOR).toContain('Formato de cada hallazgo');
  });
});

describe('El extractor: el modelo propone, el código decide', () => {
  it('acepta lo que la persona dijo y lo deja con su frase y su procedencia', () => {
    const { aceptados, descartadas } = interpretar([unaPropuesta()], DICHO, HOY);

    expect(descartadas).toHaveLength(0);
    expect(aceptados).toHaveLength(1);
    expect(aceptados[0]).toMatchObject({
      id: 'localizacion',
      estado: 'positivo',
      valor: 'pecho',
      procedencia: 'relato',
      temporalidad: 'actual',
      fecha: HOY,
    });
    // La frase viaja con el hallazgo: es la prueba de que alguien lo dijo.
    expect(aceptados[0].frase).toBe('Me duele el pecho desde ayer');
  });

  it('RECHAZA una cita inventada, aunque el hallazgo sea plausible', () => {
    // La defensa que `registrar` no puede dar: él solo comprueba que la frase
    // no esté vacía. Una cita que no existe es como se disfraza de evidencia
    // una alucinación.
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ frase: 'Me falta el aire al subir escaleras' })],
      DICHO,
      HOY
    );

    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no aparece en lo que dijo la persona');
  });

  it('RECHAZA citar a Hilda: que ella nombre un síntoma no prueba que la persona lo tenga', () => {
    const preguntoHilda = '¿Siente que le falta el aire?';
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'sintomas_acompanantes', valor: 'disnea', frase: preguntoHilda })],
      // Solo se comparan los turnos de la persona; el de Hilda no está.
      DICHO,
      HOY
    );

    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no aparece en lo que dijo la persona');
  });

  it('no se escribe lo que nadie preguntó: "no_preguntado" no es extraíble', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ estado: 'no_preguntado' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no es un estado que se pueda extraer');
  });

  it('un derivado no se acepta de fuera: lo calcula el código', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'imc', valor: '25.5', frase: 'Peso 72 kilos' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no se extrae de la conversación');
  });

  it('un dato de la ficha no se pisa con una suposición del chat', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'edad_meses', valor: '408', frase: 'Peso 72 kilos' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no se extrae de la conversación');
  });

  it('un id que no está en el vocabulario no entra', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'ansiedad_flotante' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no está en el vocabulario');
  });

  it('un desconocido sin decir por qué lo frena registrar()', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ estado: 'desconocido', valor: undefined })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('sin decir por qué');
  });

  it('convierte el número con coma decimal, que es como se escribe en español', () => {
    const { aceptados } = interpretar(
      [unaPropuesta({ id: 'peso', valor: '72,5', frase: 'Peso 72 kilos' })],
      DICHO,
      HOY
    );
    expect(aceptados[0].valor).toBe(72.5);
  });

  it('un número imposible lo frena el rango del vocabulario', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'peso', valor: '720', frase: 'Peso 72 kilos' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('fuera del rango');
  });

  it('un valor que no es número para un campo numérico se descarta con su motivo', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'peso', valor: 'bastante', frase: 'Peso 72 kilos' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('espera un número');
  });

  it('una categoría que no se puede llevar a una opción no entra', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'caracter', valor: 'raro', frase: 'como un peso encima' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('no se pudo llevar a una opción');
  });

  // ── Lo que se rescata desde el 9-nov-2026 (ver `normalizar-valor.ts`) ──

  it('rescata la intensidad dicha como la dice la gente', () => {
    const { aceptados } = interpretar(
      [unaPropuesta({ id: 'intensidad', valor: '7 de 10', frase: 'Me duele el pecho desde ayer' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(1);
    expect(aceptados[0].valor).toBe(7);
  });

  it('rescata el carácter opresivo de "como un peso"', () => {
    const { aceptados } = interpretar(
      [unaPropuesta({ id: 'caracter', valor: 'como un peso', frase: 'como un peso encima' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(1);
    expect(aceptados[0].valor).toBe('opresivo');
    // La frase de la persona sigue ahí: la categoría no la reemplaza.
    expect(aceptados[0].frase).toBe('como un peso encima');
  });

  it('rescata el tiempo de evolución de "desde ayer"', () => {
    const { aceptados } = interpretar(
      [unaPropuesta({ id: 'dias_de_evolucion', valor: 'desde ayer', frase: 'Me duele el pecho desde ayer' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(1);
    expect(aceptados[0].valor).toBe(1);
  });

  it('rescata el peso con su unidad y la talla dicha en metros', () => {
    const { aceptados } = interpretar(
      [
        unaPropuesta({ id: 'peso', valor: '72 kilos', frase: 'Peso 72 kilos' }),
        unaPropuesta({ id: 'talla', valor: '1.62', frase: 'Peso 72 kilos' }),
      ],
      DICHO,
      HOY
    );
    expect(aceptados.map((h) => h.valor)).toEqual([72, 162]);
  });

  it('normalizar no se salta el rango del vocabulario', () => {
    const { aceptados, descartadas } = interpretar(
      [unaPropuesta({ id: 'peso', valor: '900 kilos', frase: 'Peso 72 kilos' })],
      DICHO,
      HOY
    );
    expect(aceptados).toHaveLength(0);
    expect(descartadas[0].motivo).toContain('fuera del rango');
  });

  it('conserva que la persona lo minimizó y que la frase era ambigua', () => {
    const { aceptados } = interpretar(
      [unaPropuesta({ minimizado: true, ambiguo: true })],
      DICHO,
      HOY
    );
    expect(aceptados[0].minimizado).toBe(true);
    expect(aceptados[0].ambiguo).toBe(true);
  });

  it('distingue lo actual de lo que se cuenta del pasado', () => {
    const dicho = ['Se me hinchó la cara hace cinco años'];
    const { aceptados } = interpretar(
      [
        unaPropuesta({
          id: 'episodios_previos',
          valor: 'hinchazón de cara',
          frase: 'Se me hinchó la cara hace cinco años',
          temporalidad: 'antecedente',
        }),
      ],
      dicho,
      HOY
    );
    expect(aceptados[0].temporalidad).toBe('antecedente');
  });

  it('sin propuestas no se cae ni inventa nada', () => {
    expect(interpretar(undefined, DICHO, HOY)).toEqual({ aceptados: [], descartadas: [] });
    expect(interpretar([], DICHO, HOY)).toEqual({ aceptados: [], descartadas: [] });
  });
});

describe('La comprobación de la frase', () => {
  it('tolera tildes, mayúsculas y espacios de más, que son ruido de transcripción', () => {
    expect(frasePropia('ME DUELE EL   PECHO', ['Me duele el pecho desde ayer'])).toBe(true);
    expect(frasePropia('me duele el pecho', ['Me duelé el pechó desde ayer'])).toBe(true);
  });

  it('una frase vacía nunca es propia', () => {
    expect(frasePropia('', DICHO)).toBe(false);
    expect(frasePropia('   ', DICHO)).toBe(false);
  });

  it('no basta con que las palabras existan sueltas: tiene que estar la frase', () => {
    expect(frasePropia('me duele la cabeza', ['Me duele el pecho', 'Tengo la cabeza caliente'])).toBe(false);
  });
});

describe('El molde que se le da al modelo', () => {
  it('no le ofrece derivados ni datos de la ficha, para no invitarlo al error', () => {
    const ids = hallazgosExtraibles().map((h) => h.id);
    expect(ids).toContain('peso');
    expect(ids).not.toContain('imc');
    expect(ids).not.toContain('edad_meses');
    expect(ids).not.toContain('sexo_registrado');
  });

  it('exige la frase en cada hallazgo, y no deja proponer "no_preguntado"', () => {
    const esquema = esquemaDeExtraccion() as any;
    const item = esquema.properties.hallazgos.items;
    expect(item.required).toContain('frase');
    expect(item.properties.estado.enum).toEqual(['positivo', 'negado', 'desconocido']);
  });
});

describe('La llamada al modelo', () => {
  afterEach(() => vi.unstubAllGlobals());

  const respuesta = (hallazgos: unknown) => respuestaGeminiNativa(JSON.stringify({ hallazgos }));

  it('pide el molde cerrado, sin razonar y sin temperatura', () => {
    // No hay nada que deliberar, y la creatividad aquí es justo el defecto.
    const { falso, llamadasGemini } = fetchFalso(() => respuesta([]));
    vi.stubGlobal('fetch', falso);

    return extraerHallazgos(DICHO, HOY).then(() => {
      const { cuerpo } = llamadasGemini[0];
      expect(cuerpo.generationConfig.temperature).toBe(0);
      expect(cuerpo.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
      expect(cuerpo.generationConfig.responseSchema).toBeDefined();
      expect(cuerpo.generationConfig.responseMimeType).toBe('application/json');
    });
  });

  it('valida lo que vuelve: el esquema no es una garantía', async () => {
    const { falso } = fetchFalso(() =>
      respuesta([
        { id: 'localizacion', estado: 'positivo', valor: 'pecho', frase: 'Me duele el pecho desde ayer', temporalidad: 'actual' },
        // Cita inventada: el esquema la deja pasar, el código no.
        { id: 'intensidad', estado: 'positivo', valor: '9', frase: 'Es insoportable', temporalidad: 'actual' },
      ])
    );
    vi.stubGlobal('fetch', falso);

    const { aceptados, descartadas } = await extraerHallazgos(DICHO, HOY);
    expect(aceptados.map((h) => h.id)).toEqual(['localizacion']);
    expect(descartadas).toHaveLength(1);
  });

  it('si el modelo falla, la consulta sigue: no se extrae nada y no se lanza', async () => {
    const { falso } = fetchFalso(() => new Response('se cayó', { status: 500 }));
    vi.stubGlobal('fetch', falso);
    await expect(extraerHallazgos(DICHO, HOY)).resolves.toEqual({ aceptados: [], descartadas: [] });
  });

  it('si la respuesta no es JSON, tampoco se cae', async () => {
    const { falso } = fetchFalso(() => respuestaGeminiNativa('lo siento, no puedo'));
    vi.stubGlobal('fetch', falso);
    await expect(extraerHallazgos(DICHO, HOY)).resolves.toEqual({ aceptados: [], descartadas: [] });
  });

  it('sin nada que la persona haya dicho, no se gasta una llamada', async () => {
    const { falso, llamadasGemini } = fetchFalso(() => respuesta([]));
    vi.stubGlobal('fetch', falso);
    await extraerHallazgos(['', '   '], HOY);
    expect(llamadasGemini).toHaveLength(0);
  });
});
