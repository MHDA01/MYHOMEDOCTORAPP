/**
 * El normalizador de valores: que lo que la gente dice bien no se pierda por
 * formato, y que lo que no se entiende NO se adivine.
 *
 * Los casos de "no se adivina" son los que importan: un valor inventado entra a
 * la historia clínica de alguien y nadie vuelve a mirarlo.
 */
import { describe, it, expect } from 'vitest';
import { definicion } from '@/lib/hallazgos';
import {
  normalizarValor,
  primerNumero,
  diasDeEvolucion,
  categoriaDe,
} from '@/lib/normalizar-valor';

const def = (id: string) => {
  const d = definicion(id);
  if (!d) throw new Error(`no existe el hallazgo ${id}`);
  return d;
};

describe('primerNumero', () => {
  it('toma el primero, no el mayor: "un 7 de 10" es 7', () => {
    expect(primerNumero('un 7 de 10')).toBe(7);
  });

  it('lee la coma decimal del español', () => {
    expect(primerNumero('peso 82,5 kilos')).toBe(82.5);
  });

  it('lee números en palabras', () => {
    expect(primerNumero('tres días')).toBe(3);
    expect(primerNumero('hace quince días')).toBe(15);
  });

  it('respeta el orden de aparición entre dígito y palabra', () => {
    expect(primerNumero('dos semanas y 3 días')).toBe(2);
    expect(primerNumero('3 semanas y dos días')).toBe(3);
  });

  it('no deja que el artículo "un" se haga pasar por el número 1', () => {
    // El error medido: "un 7 de 10" daba 1. Registrar 1 donde dijo 7 es peor
    // que no registrar nada.
    expect(primerNumero('Yo diría que un 7 de 10')).toBe(7);
    expect(primerNumero('una 8 de 10')).toBe(8);
  });

  it('no inventa un número donde no hay', () => {
    expect(primerNumero('hace rato')).toBeNull();
    expect(primerNumero('')).toBeNull();
    // Sin número de verdad, el artículo solo no es un número.
    expect(primerNumero('un dolor en el pecho')).toBeNull();
  });
});

describe('diasDeEvolucion', () => {
  it('convierte las unidades', () => {
    expect(diasDeEvolucion('tres días')).toBe(3);
    expect(diasDeEvolucion('dos semanas')).toBe(14);
    expect(diasDeEvolucion('como un mes')).toBe(30);
    expect(diasDeEvolucion('hace 2 años')).toBe(730);
  });

  it('entiende las expresiones cerradas', () => {
    expect(diasDeEvolucion('desde ayer en la tarde')).toBe(1);
    expect(diasDeEvolucion('anoche')).toBe(1);
    expect(diasDeEvolucion('anteayer')).toBe(2);
    expect(diasDeEvolucion('hoy')).toBe(0);
  });

  it('una unidad sin número explícito vale una', () => {
    expect(diasDeEvolucion('una semana')).toBe(7);
    expect(diasDeEvolucion('un día')).toBe(1);
    expect(diasDeEvolucion('un mes')).toBe(30);
  });

  it('menos de un día son 0 días, no un descarte', () => {
    expect(diasDeEvolucion('hace 5 horas')).toBe(0);
  });

  it('acepta un número pelado', () => {
    expect(diasDeEvolucion('3')).toBe(3);
  });

  it('NO adivina los tiempos vagos', () => {
    expect(diasDeEvolucion('hace tiempo')).toBeNull();
    expect(diasDeEvolucion('desde siempre')).toBeNull();
    expect(diasDeEvolucion('hace rato')).toBeNull();
    expect(diasDeEvolucion('no me acuerdo')).toBeNull();
  });
});

describe('categoriaDe', () => {
  it('deja pasar la opción exacta sin tocarla', () => {
    expect(categoriaDe(def('caracter'), 'opresivo')).toBe('opresivo');
    expect(categoriaDe(def('patron_temporal'), 'continuo')).toBe('continuo');
  });

  it('lleva "como un peso" a opresivo, el descriptor del dolor isquémico', () => {
    expect(categoriaDe(def('caracter'), 'como un peso')).toBe('opresivo');
    expect(categoriaDe(def('caracter'), 'peso')).toBe('opresivo');
    expect(categoriaDe(def('caracter'), 'como si me apretaran')).toBe('opresivo');
  });

  it('reconoce los demás caracteres', () => {
    expect(categoriaDe(def('caracter'), 'una punzada')).toBe('punzante');
    expect(categoriaDe(def('caracter'), 'me arde')).toBe('ardor');
    expect(categoriaDe(def('caracter'), 'como un retorcijón')).toBe('colico');
  });

  it('lleva "sobre todo en la tarde" a intermitente', () => {
    expect(categoriaDe(def('patron_temporal'), 'sobre todo en la tarde')).toBe('intermitente');
    expect(categoriaDe(def('patron_temporal'), 'por ratos')).toBe('intermitente');
    expect(categoriaDe(def('patron_temporal'), 'todo el tiempo')).toBe('continuo');
  });

  it('lee el cambio de peso en la dirección correcta', () => {
    expect(categoriaDe(def('cambio_de_peso'), 'perdí como cinco kilos')).toBe('disminucion');
    expect(categoriaDe(def('cambio_de_peso'), 'he subido de peso')).toBe('aumento');
    expect(categoriaDe(def('cambio_de_peso'), 'sigo igual')).toBe('sin_cambio');
    // "no he bajado" no es "bajé": el orden de la tabla tiene que atraparlo.
    expect(categoriaDe(def('cambio_de_peso'), 'no he bajado nada')).toBe('sin_cambio');
  });

  it('NUNCA cae en "otro" por no entender', () => {
    expect(categoriaDe(def('caracter'), 'raro')).toBeNull();
    expect(categoriaDe(def('caracter'), 'no sé cómo explicarlo')).toBeNull();
  });

  it('no devuelve nada para un hallazgo que no es categoría', () => {
    expect(categoriaDe(def('peso'), 'mucho')).toBeNull();
  });
});

describe('normalizarValor', () => {
  it('una presencia no lleva valor', () => {
    expect(normalizarValor(def('dolor_toracico'), 'sí')).toEqual({ ok: true });
  });

  it('el texto viaja como lo dijo la persona', () => {
    const r = normalizarValor(def('irradiacion'), 'se me va al brazo izquierdo');
    expect(r).toEqual({ ok: true, valor: 'se me va al brazo izquierdo' });
  });

  it('rescata la intensidad de "7 de 10"', () => {
    expect(normalizarValor(def('intensidad'), '7 de 10')).toEqual({ ok: true, valor: 7 });
    expect(normalizarValor(def('intensidad'), 'un 7 de 10')).toEqual({ ok: true, valor: 7 });
  });

  it('rescata el peso de "82 kilos"', () => {
    expect(normalizarValor(def('peso'), '82 kilos')).toEqual({ ok: true, valor: 82 });
  });

  it('pasa la talla de metros a centímetros', () => {
    expect(normalizarValor(def('talla'), '1.62')).toEqual({ ok: true, valor: 162 });
    expect(normalizarValor(def('talla'), 'mido 1,62 metros')).toEqual({ ok: true, valor: 162 });
  });

  it('deja la talla en centímetros como está', () => {
    expect(normalizarValor(def('talla'), '162')).toEqual({ ok: true, valor: 162 });
  });

  it('pasa la temperatura de Fahrenheit a Celsius', () => {
    expect(normalizarValor(def('fiebre_medida'), '100.4')).toEqual({ ok: true, valor: 38 });
  });

  it('deja la temperatura en Celsius como está', () => {
    expect(normalizarValor(def('fiebre_medida'), '36.8')).toEqual({ ok: true, valor: 36.8 });
  });

  it('redondea donde el molde pide un entero', () => {
    expect(normalizarValor(def('intensidad'), '7.4')).toEqual({ ok: true, valor: 7 });
  });

  it('convierte el tiempo de evolución', () => {
    expect(normalizarValor(def('dias_de_evolucion'), 'desde ayer en la tarde')).toEqual({
      ok: true,
      valor: 1,
    });
  });

  it('descarta el tiempo de evolución que no se puede saber', () => {
    const r = normalizarValor(def('dias_de_evolucion'), 'hace tiempo');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('no dice cuántos días');
  });

  it('descarta la categoría que no se pudo llevar a una opción', () => {
    const r = normalizarValor(def('caracter'), 'raro');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('no se pudo llevar a una opción');
  });

  it('descarta donde no hay número que sacar', () => {
    const r = normalizarValor(def('peso'), 'bastante');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain('espera un número');
  });

  it('un valor vacío no es un error: el hallazgo puede no llevar valor', () => {
    expect(normalizarValor(def('intensidad'), '')).toEqual({ ok: true });
    expect(normalizarValor(def('intensidad'), undefined)).toEqual({ ok: true });
  });

  it('un derivado no se normaliza: lo calcula el código', () => {
    const r = normalizarValor(def('imc'), '28');
    expect(r.ok).toBe(false);
  });

  it('normalizar no se salta el rango: lo imposible sigue siendo imposible', () => {
    // 400 kg pasa el normalizador; a `registrar` le toca el rango.
    expect(normalizarValor(def('peso'), '900 kilos')).toEqual({ ok: true, valor: 900 });
  });
});
