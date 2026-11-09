import { describe, expect, it } from 'vitest';
import {
  type HallazgoRegistrado,
  contradice,
  definicion,
  imc,
  incorporar,
  noDecideConducta,
  ordenCanonico,
  registrar,
  sinPreguntar,
} from '@/lib/hallazgos';

const HOY = '2026-11-08';

/** Un hallazgo ya registrado, para las pruebas que no pasan por `registrar`. */
const dado = (h: Partial<HallazgoRegistrado> & { id: string }): HallazgoRegistrado => ({
  estado: 'positivo',
  procedencia: 'relato',
  frase: 'lo dijo el paciente',
  fecha: HOY,
  temporalidad: 'actual',
  ...h,
});

const bien = (r: ReturnType<typeof registrar>) => {
  if (!r.ok) throw new Error(`se esperaba un registro válido: ${r.motivo}`);
  return r.hallazgo;
};

describe('Ningún valor se infiere', () => {
  it('lo que viene del relato tiene que traer la frase de la que salió', () => {
    const r = registrar({
      id: 'dolor_toracico',
      estado: 'positivo',
      procedencia: 'relato',
      fecha: HOY,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('frase');
  });

  it('el sexo no se calcula: no es un derivado, se pregunta', () => {
    // La regla salió de la prueba del 28-oct-2026, donde Claude asumió el sexo
    // por el nombre del paciente y construyó el caso sobre esa invención.
    const r = registrar({
      id: 'sexo_registrado',
      estado: 'positivo',
      valor: 'masculino',
      procedencia: 'calculo',
      fecha: HOY,
    });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('no es derivado');
  });

  it('un derivado no se acepta de fuera: solo lo escribe el código', () => {
    const r = registrar({ id: 'imc', estado: 'positivo', valor: 31, procedencia: 'relato', frase: 'estoy gordo', fecha: HOY });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('derivado');
  });

  it('una pregunta sustituta da un hallazgo cualitativo, nunca una medición', () => {
    // "No me he pesado" no se arregla con "la ropa me queda apretada": eso da
    // el cambio de peso, no el peso.
    const medicion = registrar({
      id: 'peso',
      estado: 'positivo',
      valor: 80,
      procedencia: 'sustituta',
      frase: 'la ropa me queda más apretada',
      fecha: HOY,
    });
    expect(medicion.ok).toBe(false);
    expect(medicion.ok === false && medicion.motivo).toContain('medición');

    const cualitativo = registrar({
      id: 'cambio_de_peso',
      estado: 'positivo',
      valor: 'aumento',
      procedencia: 'sustituta',
      frase: 'la ropa me queda más apretada',
      fecha: HOY,
    });
    expect(cualitativo.ok).toBe(true);
  });
});

describe('Los cuatro estados', () => {
  it('"no me he pesado" es desconocido con su razón, no un negativo', () => {
    // El caso exacto del 28-oct-2026. Guardarlo como `negado` habría escrito en
    // la historia que niega cambios de peso, que es algo que nunca afirmó.
    const h = bien(
      registrar({
        id: 'cambio_de_peso',
        estado: 'desconocido',
        procedencia: 'relato',
        frase: 'no me he pesado',
        razon: 'no se ha pesado',
        fecha: HOY,
      })
    );
    expect(h.estado).toBe('desconocido');
    expect(h.razon).toBe('no se ha pesado');
  });

  it('un desconocido sin razón no se registra', () => {
    const r = registrar({ id: 'peso', estado: 'desconocido', procedencia: 'relato', frase: 'no sé', fecha: HOY });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('sin decir por qué');
  });

  it('lo que nadie preguntó no puede traer valor', () => {
    const r = registrar({ id: 'peso', estado: 'no_preguntado', valor: 70, procedencia: 'ficha', fecha: HOY });
    expect(r.ok).toBe(false);
  });

  it('un negado no trae valor: el estado ya es la respuesta', () => {
    const r = registrar({
      id: 'fiebre_medida',
      estado: 'negado',
      valor: 36.5,
      procedencia: 'relato',
      frase: 'no he tenido fiebre',
      fecha: HOY,
    });
    expect(r.ok).toBe(false);
  });
});

describe('El molde de cada valor', () => {
  it('acepta una temperatura plausible y rechaza una imposible', () => {
    expect(registrar({ id: 'fiebre_medida', estado: 'positivo', valor: 38.5, procedencia: 'relato', frase: 'me marcó 38.5', fecha: HOY }).ok).toBe(true);
    const r = registrar({ id: 'fiebre_medida', estado: 'positivo', valor: 120, procedencia: 'relato', frase: 'me marcó 120', fecha: HOY });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('fuera del rango');
  });

  it('una categoría solo acepta sus opciones', () => {
    const r = registrar({ id: 'mecanismo', estado: 'positivo', valor: 'cansancio', procedencia: 'relato', frase: 'me cansé', fecha: HOY });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.motivo).toContain('no es una opción');
  });

  it('una presencia no lleva valor aparte del estado', () => {
    const r = registrar({ id: 'disnea', estado: 'positivo', valor: 'sí', procedencia: 'relato', frase: 'me ahogo', fecha: HOY });
    expect(r.ok).toBe(false);
  });

  it('los días de evolución son un entero', () => {
    expect(registrar({ id: 'dias_de_evolucion', estado: 'positivo', valor: 30.5, procedencia: 'relato', frase: 'un mes', fecha: HOY }).ok).toBe(false);
    expect(registrar({ id: 'dias_de_evolucion', estado: 'positivo', valor: 30, procedencia: 'relato', frase: 'un mes', fecha: HOY }).ok).toBe(true);
  });

  it('la fecha es AAAA-MM-DD, nunca ISO con hora', () => {
    const r = registrar({ id: 'disnea', estado: 'negado', procedencia: 'relato', frase: 'no me ahogo', fecha: '2026-11-08T10:00:00Z' });
    expect(r.ok).toBe(false);
  });

  it('un hallazgo que no está en el vocabulario no se registra', () => {
    const r = registrar({ id: 'aura_energetica', estado: 'positivo', procedencia: 'relato', frase: 'la siento baja', fecha: HOY });
    expect(r.ok).toBe(false);
  });
});

describe('Derivados: completos o nada', () => {
  it('calcula el IMC con peso y talla', () => {
    expect(imc(80, 170)).toBe(27.7);
  });

  it('devuelve null si falta cualquiera de los dos', () => {
    // No se calcula ningún puntaje al que le falte una variable: se dice qué falta.
    expect(imc(80, undefined)).toBeNull();
    expect(imc(undefined, 170)).toBeNull();
    expect(imc(80, 0)).toBeNull();
  });
});

describe('Las contradicciones se preguntan, no se sobrescriben', () => {
  const intermitente = dado({ id: 'patron_temporal', valor: 'intermitente', frase: 'en ocasiones no puedo ni dormir' });
  const continuo = dado({ id: 'patron_temporal', valor: 'continuo', frase: 'es un dolor persistente' });

  it('reconoce la contradicción del caso del 28-oct', () => {
    // El "en ocasiones" calificaba el sueño, no el dolor; más adelante el
    // paciente describió el dolor como persistente.
    expect(contradice(intermitente, continuo)).toBe(true);
  });

  it('al incorporar el nuevo, se queda el previo y la contradicción sale a preguntarse', () => {
    const { hallazgos, contradicciones } = incorporar([intermitente], continuo);
    expect(contradicciones).toHaveLength(1);
    expect(hallazgos).toHaveLength(1);
    expect(hallazgos[0].valor).toBe('intermitente');
  });

  it('un hallazgo ambiguo no contradice: todavía no afirma nada', () => {
    expect(contradice({ ...intermitente, ambiguo: true }, continuo)).toBe(false);
  });

  it('el mismo nombre en dos tiempos verbales no es una contradicción', () => {
    // "Se me hinchó la cara hace cinco años" y "se me está hinchando la cara"
    // son dos hechos distintos, no uno que cambió.
    const antes = dado({ id: 'disnea', temporalidad: 'antecedente' });
    const ahora = dado({ id: 'disnea', estado: 'negado', temporalidad: 'actual' });
    expect(contradice(antes, ahora)).toBe(false);
  });

  it('sobre lo que nadie había preguntado, el hallazgo nuevo entra sin pelear', () => {
    const hueco = dado({ id: 'ortopnea', estado: 'no_preguntado', procedencia: 'ficha', frase: undefined });
    const { hallazgos, contradicciones } = incorporar([hueco], dado({ id: 'ortopnea', estado: 'negado' }));
    expect(contradicciones).toHaveLength(0);
    expect(hallazgos[0].estado).toBe('negado');
  });

  it('un hallazgo de otro nombre se agrega, no reemplaza', () => {
    const { hallazgos } = incorporar([intermitente], dado({ id: 'disnea_de_esfuerzo' }));
    expect(hallazgos).toHaveLength(2);
  });
});

describe('Lo que falta y lo que no puede decidir', () => {
  it('sinPreguntar distingue un hueco de un negativo registrado', () => {
    const hallazgos = [dado({ id: 'ortopnea', estado: 'negado' })];
    expect(sinPreguntar(['ortopnea', 'edema'], hallazgos)).toEqual(['edema']);
  });

  it('el curso clínico está nombrado pero pendiente de aprobación del médico', () => {
    expect(definicion('curso_clinico')?.pendienteAprobacion).toBe(true);
    const pendientes = noDecideConducta([dado({ id: 'curso_clinico', valor: 'progresivo' })]);
    expect(pendientes).toHaveLength(1);
  });

  it('un hallazgo ambiguo tampoco decide conducta', () => {
    expect(noDecideConducta([dado({ id: 'patron_temporal', valor: 'continuo', ambiguo: true })])).toHaveLength(1);
  });

  it('un hallazgo firme y aprobado sí decide', () => {
    expect(noDecideConducta([dado({ id: 'disnea_de_esfuerzo' })])).toHaveLength(0);
  });
});

describe('El orden canónico de la anamnesis', () => {
  it('va del paso 1 al 10 sin saltarse ninguno', () => {
    const pasos = ordenCanonico().map((h) => h.pasoAnamnesis as number);
    expect(pasos[0]).toBe(1);
    expect(new Set(pasos)).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
    expect([...pasos]).toEqual([...pasos].sort((a, b) => a - b));
  });

  it('las dos variables de tiempo que se agregaron el 28-oct van en los puestos 2 y 3', () => {
    const porPaso = ordenCanonico().filter((h) => h.pasoAnamnesis === 2 || h.pasoAnamnesis === 3);
    expect(porPaso.map((h) => h.id)).toEqual(['patron_temporal', 'dias_de_evolucion']);
  });

  it('la minimización viaja con el hallazgo', () => {
    // "Muy suave y tolerable, pero persistente": lo que subraya el paciente no
    // es lo clínicamente relevante, y la intensidad referida no baja el nivel.
    const h = bien(
      registrar({
        id: 'intensidad',
        estado: 'positivo',
        valor: 2,
        procedencia: 'relato',
        frase: 'muy suave, tolerable pero persistente',
        minimizado: true,
        fecha: HOY,
      })
    );
    expect(h.minimizado).toBe(true);
  });
});
