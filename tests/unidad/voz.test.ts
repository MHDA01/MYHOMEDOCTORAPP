import { describe, expect, it } from 'vitest';
import {
  MAX_CARACTERES_POR_TROZO,
  elegirVoz,
  limpiarParaVoz,
  partirParaVoz,
  valeLaPenaEnviar,
} from '@/lib/voz';

const voz = (name: string, lang: string) => ({ name, lang });

describe('Elegir la voz del aparato', () => {
  it('prefiere el español de Colombia sobre cualquier otro', () => {
    const elegida = elegirVoz([voz('Jorge', 'es-ES'), voz('Carlos', 'es-CO'), voz('Paulina', 'es-MX')]);
    expect(elegida?.lang).toBe('es-CO');
  });

  it('con varios latinoamericanos sigue el orden de cercanía', () => {
    expect(elegirVoz([voz('Jorge', 'es-ES'), voz('Paulina', 'es-MX')])?.lang).toBe('es-MX');
    expect(elegirVoz([voz('Mónica', 'es-ES'), voz('Sabina', 'es-US')])?.lang).toBe('es-US');
  });

  it('a igualdad de idioma, prefiere una voz femenina', () => {
    const elegida = elegirVoz([voz('Jorge', 'es-CO'), voz('Mónica', 'es-CO')]);
    expect(elegida?.name).toBe('Mónica');
  });

  it('prefiere una voz que suene a persona aunque su acento quede más lejos', () => {
    // Sabina es la voz local de Windows: correcta de acento, robótica de sonido.
    // La de Google se sintetiza en servidor y suena a persona; eso pesa más,
    // porque en el modo conversación la voz es toda la experiencia.
    const elegida = elegirVoz([
      { name: 'Microsoft Sabina', lang: 'es-MX', localService: true },
      { name: 'Google español', lang: 'es-ES', localService: false },
    ]);
    expect(elegida?.name).toBe('Google español');
  });

  it('entre varias voces naturales, vuelve a mandar la cercanía del acento', () => {
    const elegida = elegirVoz([
      { name: 'Google español', lang: 'es-ES', localService: false },
      { name: 'Google español de Estados Unidos', lang: 'es-US', localService: false },
    ]);
    expect(elegida?.lang).toBe('es-US');
  });

  it('reconoce la voz natural por el nombre cuando el navegador no dice si es local', () => {
    const elegida = elegirVoz([voz('Microsoft Sabina', 'es-MX'), voz('Microsoft Dalia Online (Natural)', 'es-MX')]);
    expect(elegida?.name).toBe('Microsoft Dalia Online (Natural)');
  });

  it('sin ninguna voz en español devuelve null y Hilda se queda callada', () => {
    expect(elegirVoz([voz('Samantha', 'en-US'), voz('Luciana', 'pt-BR')])).toBeNull();
    expect(elegirVoz([])).toBeNull();
  });

  it('acepta el guion bajo que usan algunos Android (es_CO)', () => {
    expect(elegirVoz([voz('Jorge', 'es-ES'), voz('Carlos', 'es_CO')])?.name).toBe('Carlos');
  });
});

describe('Lo que se dice en voz alta', () => {
  it('no pronuncia los asteriscos de la negrita ni las almohadillas del título', () => {
    expect(limpiarParaVoz('## Qué hacer\n**Importante:** ve a urgencias')).toBe('Qué hacer. Importante: ve a urgencias');
  });

  it('conserva los signos de apertura de pregunta', () => {
    expect(limpiarParaVoz('**¿Desde cuándo?**')).toBe('¿Desde cuándo?');
  });

  it('quita las viñetas pero conserva cada punto como frase', () => {
    const dicho = limpiarParaVoz('Haz esto:\n- Toma agua\n- Descansa');
    expect(dicho).toBe('Haz esto:. Toma agua. Descansa');
    expect(dicho).not.toContain('-');
  });

  it('quita numeración de lista y líneas de separación', () => {
    expect(limpiarParaVoz('1. Reposo\n2. Líquidos\n---')).toBe('Reposo. Líquidos');
  });

  it('dice el texto del enlace y nunca la dirección', () => {
    expect(limpiarParaVoz('Mira [la guía](https://ejemplo.com/guia) y listo')).toBe('Mira la guía y listo');
    expect(limpiarParaVoz('Entra a https://ejemplo.com ya')).toBe('Entra a ya');
  });

  it('lee las unidades en letra', () => {
    expect(limpiarParaVoz('Fiebre de 38°C')).toBe('Fiebre de 38 grados');
    expect(limpiarParaVoz('Tomó 500 mg')).toBe('Tomó 500 miligramos');
  });

  it('se come los emojis, incluido el del aviso de urgencias', () => {
    expect(limpiarParaVoz('⚠️ Ve a urgencias 🚑')).toBe('Ve a urgencias');
  });

  it('un texto vacío o solo de adornos no hace hablar a nadie', () => {
    expect(limpiarParaVoz('')).toBe('');
    expect(limpiarParaVoz('---\n\n')).toBe('');
  });

  it('no toca el contenido clínico', () => {
    const original = 'Si la fiebre pasa de 3 días, consulta de forma presencial.';
    expect(limpiarParaVoz(original)).toBe(original);
  });
});

describe('Partir el texto para el sintetizador', () => {
  it('un texto corto va de una sola pieza, con sus signos de apertura', () => {
    expect(partirParaVoz('Hola, ¿cómo te sientes?')).toEqual(['Hola, ¿cómo te sientes?']);
    expect(partirParaVoz('¡Claro! ¿Desde cuándo?')).toEqual(['¡Claro! ¿Desde cuándo?']);
  });

  it('corta por frases y ningún trozo pasa del tope', () => {
    const largo = Array.from({ length: 20 }, (_, i) => `Esta es la frase número ${i} de la respuesta.`).join(' ');
    const trozos = partirParaVoz(largo);

    expect(trozos.length).toBeGreaterThan(1);
    expect(trozos.every((t) => t.length <= MAX_CARACTERES_POR_TROZO)).toBe(true);
    // No se pierde ni se repite nada por el camino.
    expect(trozos.join(' ').replace(/\s+/g, ' ')).toBe(largo.replace(/\s+/g, ' '));
  });

  it('una sola frase larguísima se corta por palabras, sin partirlas', () => {
    const frase = `${'palabra '.repeat(80)}final.`;
    const trozos = partirParaVoz(frase);

    expect(trozos.every((t) => t.length <= MAX_CARACTERES_POR_TROZO)).toBe(true);
    expect(trozos.join(' ').split(/\s+/).filter(Boolean)).toEqual(frase.split(/\s+/).filter(Boolean));
  });

  it('un texto vacío no genera trozos', () => {
    expect(partirParaVoz('   ')).toEqual([]);
  });
});

describe('Cuándo vale la pena mandar lo que se oyó', () => {
  it('un ruido de una letra o un silencio no se manda', () => {
    expect(valeLaPenaEnviar('')).toBe(false);
    expect(valeLaPenaEnviar('   ')).toBe(false);
    expect(valeLaPenaEnviar('a')).toBe(false);
  });

  it('una respuesta corta de verdad sí se manda', () => {
    expect(valeLaPenaEnviar('sí')).toBe(true);
    expect(valeLaPenaEnviar('me duele la cabeza')).toBe(true);
  });
});
