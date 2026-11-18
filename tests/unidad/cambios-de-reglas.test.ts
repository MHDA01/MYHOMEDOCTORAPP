/**
 * Lo que entra, lo que sale y lo que cambia.
 *
 * El fallo que esto existe para evitar: publicar para añadir un activador y
 * retirar sin darse cuenta una alarma que el documento pegado no traía. Un
 * recuento de reglas no avisa; "sale 1 alarma" sí.
 */

import { describe, expect, it } from 'vitest';
import { BASE_VACIA, type Alarma, type Activador, type BaseDeReglas } from '@/lib/grafo-reglas';
import { compararBases, pesoDelCambio } from '@/lib/cambios-de-reglas';

const fuente = { documento: 'Guía de ejemplo' };
const aprobadoPor = { medico: 'Médico responsable', fecha: '2026-10-28' };

const ALARMA: Alarma = {
  id: 'dificultad_para_respirar',
  nombreClinico: 'Disnea aguda',
  cuando: { op: 'presente', hallazgo: 'disnea' },
  escalaA: 'urgencias',
  severidad: 'critica',
  fuente,
  aprobadoPor,
};

const ACTIVADOR: Activador = {
  id: 'sospecha_de_ejemplo',
  sospecha: 'Sospecha de ejemplo',
  disparadores: { op: '>=', hallazgo: 'fiebre_medida', valor: 38 },
  prioridad: 'alta',
  fuente,
  aprobadoPor,
};

const base = (extra: Partial<BaseDeReglas>): BaseDeReglas => ({ ...BASE_VACIA, ...extra });

describe('Comparar dos bases', () => {
  it('de nada a una alarma: entra una y no sale ninguna', () => {
    const c = compararBases(BASE_VACIA, base({ alarmas: [ALARMA] }));
    expect(c.entran).toHaveLength(1);
    expect(c.entran[0]).toMatchObject({ clase: 'alarmas', comoSeLlama: 'Alarma', titulo: 'Disnea aguda' });
    expect(c.salen).toEqual([]);
    expect(c.sinCambios).toBe(false);
    expect(pesoDelCambio(c)).toBe('solo_suma');
  });

  it('la misma base no cambia nada, y el orden de las claves no cuenta como cambio', () => {
    // Firestore devuelve los campos de un mapa ordenados por nombre; el
    // analizador los construye en el orden en que están escritos. Si eso contara
    // como un cambio, cada publicación diría que cambió todo.
    const alRevés = JSON.parse(
      JSON.stringify({
        severidad: ALARMA.severidad,
        escalaA: ALARMA.escalaA,
        cuando: ALARMA.cuando,
        nombreClinico: ALARMA.nombreClinico,
        id: ALARMA.id,
        aprobadoPor,
        fuente,
      })
    ) as Alarma;

    const c = compararBases(base({ alarmas: [ALARMA] }), base({ alarmas: [alRevés] }));
    expect(c.sinCambios).toBe(true);
    expect(c.iguales).toBe(1);
    expect(pesoDelCambio(c)).toBe('ninguno');
  });

  it('un umbral distinto con el mismo id es un cambio, no una entrada', () => {
    const masAlto: Activador = { ...ACTIVADOR, disparadores: { op: '>=', hallazgo: 'fiebre_medida', valor: 39 } };
    const c = compararBases(base({ activadores: [ACTIVADOR] }), base({ activadores: [masAlto] }));
    expect(c.entran).toEqual([]);
    expect(c.cambian).toHaveLength(1);
    expect(c.cambian[0].id).toBe('sospecha_de_ejemplo');
    expect(pesoDelCambio(c)).toBe('altera');
  });

  it('una alarma que desaparece se avisa aparte de todo lo demás', () => {
    const c = compararBases(base({ alarmas: [ALARMA], activadores: [ACTIVADOR] }), base({ activadores: [ACTIVADOR] }));
    expect(c.salen).toHaveLength(1);
    expect(c.salen[0].clase).toBe('alarmas');
    expect(c.iguales).toBe(1);
    // Añadir mientras se quita una alarma sigue pesando lo que pesa la alarma.
    const conOtroActivador = compararBases(
      base({ alarmas: [ALARMA] }),
      base({ activadores: [ACTIVADOR] })
    );
    expect(pesoDelCambio(conOtroActivador)).toBe('quita_alarma');
  });

  it('el orden de una lista dentro de una regla sí es un cambio', () => {
    // En una condición el orden es la cola de preguntas; en un árbol, el orden
    // de las ramas. Ahí mover algo cambia la conducta.
    const unOrden: Activador = {
      ...ACTIVADOR,
      disparadores: {
        op: 'todas',
        de: [
          { op: 'presente', hallazgo: 'disnea' },
          { op: 'presente', hallazgo: 'fiebre_medida' },
        ],
      },
    };
    const otro: Activador = {
      ...ACTIVADOR,
      disparadores: {
        op: 'todas',
        de: [
          { op: 'presente', hallazgo: 'fiebre_medida' },
          { op: 'presente', hallazgo: 'disnea' },
        ],
      },
    };
    expect(compararBases(base({ activadores: [unOrden] }), base({ activadores: [otro] })).cambian).toHaveLength(1);
  });

  it('cada clase se compara por su lado: dos ids iguales en clases distintas no se cruzan', () => {
    const alarmaRara: Alarma = { ...ALARMA, id: 'mismo_id' };
    const activadorRaro: Activador = { ...ACTIVADOR, id: 'mismo_id' };
    const c = compararBases(base({ alarmas: [alarmaRara] }), base({ activadores: [activadorRaro] }));
    expect(c.salen.map((r) => r.clase)).toEqual(['alarmas']);
    expect(c.entran.map((r) => r.clase)).toEqual(['activadores']);
    expect(c.iguales).toBe(0);
  });
});
