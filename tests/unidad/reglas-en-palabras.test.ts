/**
 * Una regla, leída por el médico.
 *
 * El diseño dice que el activador se revisa en medio minuto. Lo que se prueba
 * aquí es que la frase no engañe: sobre todo que "A y (B o C)" no se lea igual
 * que "(A y B) o C", que es la forma de aprobar una regla creyendo que dice otra
 * cosa.
 */

import { describe, expect, it } from 'vitest';
import { type Alarma, type Condicion } from '@/lib/grafo-reglas';
import { alarmaEnPalabras, condicionEnPalabras } from '@/lib/reglas-en-palabras';

describe('Una condición, en una frase', () => {
  it('los paréntesis no se pierden cuando una compuesta va dentro de otra', () => {
    const anidada: Condicion = {
      op: 'todas',
      de: [
        { op: 'presente', hallazgo: 'disnea' },
        { op: 'alguna', de: [{ op: 'presente', hallazgo: 'fiebre_medida' }, { op: 'presente', hallazgo: 'tos' }] },
      ],
    };
    const frase = condicionEnPalabras(anidada);
    expect(frase).toContain(' y (');
    expect(frase).toContain(' o ');
    // La de fuera no se envuelve: solo las de dentro.
    expect(frase.startsWith('(')).toBe(false);
  });

  it('"al menos n de" se dice con el número', () => {
    expect(
      condicionEnPalabras({
        op: 'alMenos',
        n: 2,
        de: [{ op: 'presente', hallazgo: 'disnea' }, { op: 'presente', hallazgo: 'tos' }],
      })
    ).toContain('al menos 2 de');
  });

  it('la temporalidad se dice, porque cambia la conducta', () => {
    expect(condicionEnPalabras({ op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'antecedente' })).toContain(
      'como antecedente'
    );
    expect(condicionEnPalabras({ op: 'presente', hallazgo: 'tabaquismo', temporalidad: 'actual' })).toContain(' hoy');
  });

  it('las comparaciones y los valores se leen tal cual', () => {
    expect(condicionEnPalabras({ op: '>=', hallazgo: 'fiebre_medida', valor: 38 })).toContain('>= 38');
    expect(condicionEnPalabras({ op: '==', hallazgo: 'patron_temporal', valor: 'continuo' })).toContain('"continuo"');
    expect(condicionEnPalabras({ op: 'en', hallazgo: 'patron_temporal', valores: ['continuo', 'intermitente'] })).toContain(
      'alguno de'
    );
  });

  it('un hallazgo que no está en el vocabulario se muestra con su id, no se esconde', () => {
    // `revisarBase()` ya lo rechaza; en la pantalla hay que ver cuál es.
    expect(condicionEnPalabras({ op: 'presente', hallazgo: 'inventado_xyz' })).toContain('¿inventado_xyz?');
  });

  it('un negado se dice negado, que no es lo mismo que no estar', () => {
    expect(condicionEnPalabras({ op: 'negado', hallazgo: 'disnea' })).toContain('negado');
    expect(condicionEnPalabras({ op: 'conocido', hallazgo: 'disnea' })).toContain('contestado');
  });
});

describe('Una alarma, en palabras', () => {
  const alarma: Alarma = {
    id: 'dificultad_para_respirar',
    nombreClinico: 'Disnea aguda',
    cuando: { op: 'presente', hallazgo: 'disnea' },
    escalaA: 'urgencias',
    severidad: 'critica',
    fuente: { documento: 'Guía de ejemplo', pagina: '12', anio: 2025 },
    aprobadoPor: { medico: 'Médico responsable', fecha: '2026-10-28' },
  };

  it('dice qué la dispara, a dónde escala, su fuente y su firma', () => {
    const r = alarmaEnPalabras(alarma);
    expect(r.titulo).toBe('Disnea aguda');
    expect(r.id).toBe('dificultad_para_respirar');
    expect(r.lineas.join(' ')).toContain('Se dispara cuando');
    expect(r.lineas.join(' ')).toContain('urgencias');
    expect(r.fuente).toBe('Guía de ejemplo, p. 12, 2025');
    expect(r.firma).toBe('Médico responsable · 2026-10-28');
  });

  it('el guion bajo del nivel de atención no llega a la pantalla', () => {
    const r = alarmaEnPalabras({ ...alarma, escalaA: 'consulta_prioritaria' });
    expect(r.lineas.join(' ')).toContain('consulta prioritaria');
  });
});
