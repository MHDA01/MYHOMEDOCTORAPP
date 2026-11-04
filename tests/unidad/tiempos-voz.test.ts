import { describe, expect, it } from 'vitest';
import { crearRelojVoz, formatearDuracion, formatearTramos } from '@/lib/tiempos-voz';

/** Un reloj de mentira que avanza cuando se le dice. */
function relojFalso(desde = 1_000) {
  let t = desde;
  return {
    ahora: () => t,
    avanzar: (ms: number) => {
      t += ms;
    },
  };
}

describe('Formatear duraciones', () => {
  it('por debajo del segundo, en milisegundos', () => {
    expect(formatearDuracion(0)).toBe('0 ms');
    expect(formatearDuracion(420)).toBe('420 ms');
    expect(formatearDuracion(999)).toBe('999 ms');
  });

  it('a partir del segundo, en segundos con un decimal', () => {
    expect(formatearDuracion(1000)).toBe('1.0 s');
    expect(formatearDuracion(6180)).toBe('6.2 s');
  });

  it('nunca muestra una duración negativa', () => {
    expect(formatearDuracion(-50)).toBe('0 ms');
  });

  it('une los tramos en una sola línea', () => {
    expect(formatearTramos([{ nombre: 'silencio', ms: 2500 }, { nombre: 'IA', ms: 300 }])).toBe(
      'silencio 2.5 s · IA 300 ms'
    );
  });
});

describe('Cronómetro del turno hablado', () => {
  it('mide el reparto completo de la espera', () => {
    const falso = relojFalso();
    const reloj = crearRelojVoz({ origen: falso.ahora(), ahora: falso.ahora });

    falso.avanzar(2500); // el silencio que decide enviar
    reloj.marcar('envio');
    falso.avanzar(6000); // Firestore y el modelo
    reloj.marcar('respuesta');
    falso.avanzar(100);
    reloj.marcar('audio-pedido');
    falso.avanzar(900); // la síntesis del primer trozo
    reloj.marcar('audio-listo');
    falso.avanzar(200);
    reloj.marcar('primera-palabra');

    expect(reloj.tramos()).toEqual([
      { nombre: 'silencio', ms: 2500 },
      { nombre: 'servidor', ms: 6000 },
      { nombre: 'síntesis', ms: 900 },
      { nombre: 'voz', ms: 1200 },
      { nombre: 'total', ms: 9700 },
    ]);
    expect(reloj.resumen()).toBe(
      'silencio 2.5 s · servidor 6.0 s · síntesis 900 ms · voz 1.2 s · total 9.7 s'
    );
  });

  it('omite los tramos que no se pudieron medir', () => {
    const falso = relojFalso();
    const reloj = crearRelojVoz({ origen: falso.ahora(), ahora: falso.ahora });

    // El respaldo del aparato no pide nada al servidor: no hay síntesis.
    falso.avanzar(2500);
    reloj.marcar('envio');
    falso.avanzar(4000);
    reloj.marcar('respuesta');
    falso.avanzar(300);
    reloj.marcar('primera-palabra');

    expect(reloj.tramos().map((t) => t.nombre)).toEqual(['silencio', 'servidor', 'voz', 'total']);
  });

  it('sin origen, el turno no tiene cero y no hay silencio ni total', () => {
    const falso = relojFalso();
    const reloj = crearRelojVoz({ ahora: falso.ahora });

    reloj.marcar('respuesta');
    falso.avanzar(500);
    reloj.marcar('primera-palabra');

    expect(reloj.tramos()).toEqual([{ nombre: 'voz', ms: 500 }]);
  });

  it('la primera marca manda: un trozo de audio tras otro no la mueve', () => {
    const falso = relojFalso();
    const reloj = crearRelojVoz({ origen: falso.ahora(), ahora: falso.ahora });

    reloj.marcar('audio-pedido');
    falso.avanzar(900);
    reloj.marcar('audio-listo');
    // Los trozos siguientes vuelven a pasar por aquí; lo que se espera es el primero.
    falso.avanzar(5000);
    reloj.marcar('audio-pedido');
    reloj.marcar('audio-listo');

    expect(reloj.tramos()).toContainEqual({ nombre: 'síntesis', ms: 900 });
  });

  it('avisa una sola vez por etapa', () => {
    const vistas: string[] = [];
    const reloj = crearRelojVoz({ alMarcar: (etapa) => vistas.push(etapa) });

    reloj.marcar('primera-palabra');
    reloj.marcar('primera-palabra');

    expect(vistas).toEqual(['primera-palabra']);
  });

  it('un reloj sin marcas da un resumen vacío, no un error', () => {
    expect(crearRelojVoz().resumen()).toBe('');
  });
});
