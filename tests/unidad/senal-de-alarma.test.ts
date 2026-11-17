/**
 * El botón de urgencias del chat: que esté siempre y que la alarma lo encienda.
 *
 * Decisión de Alexander (11-nov-2026). Pidió un botón que apareciera al detectar
 * una señal de alarma; se construyó la variante que está siempre y se enciende,
 * porque un botón que solo aparece con la alarma es un botón ausente cuando la
 * detección falla, y el falso negativo es el fallo grave.
 *
 * Las cuatro reglas que se fijan aquí:
 *
 *  1. La frase de escalada vive en UN solo sitio. El prompt la interpola y el
 *     detector la busca: si alguien edita una y no la otra, esto falla.
 *  2. Solo los mensajes de Hilda encienden la alarma. Si la enciende el paciente,
 *     el botón afirmaría una alarma que nadie evaluó.
 *  3. Una vez encendida, no se apaga en esa conversación.
 *  4. El botón existe en la cabecera sin depender de la alarma, y no marca
 *     directo: lleva a la pantalla.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { FRASE_ESCALADA, alarmaEnLaConversacion, haySenalDeAlarma } from '../../src/lib/senal-de-alarma';

const RAIZ = join(__dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');

describe('La frase de escalada vive en un solo sitio', () => {
  it('el prompt de Hilda la interpola, no la repite escrita a mano', () => {
    const prompt = leer('src/app/actions/teleorientacion.ts');
    expect(prompt, 'el prompt debe usar ${FRASE_ESCALADA}').toContain('${FRASE_ESCALADA}');
    expect(
      prompt.includes('Esto requiere atención médica presencial urgente. Por favor acude'),
      'si la frase vuelve a estar escrita a mano en el prompt, puede separarse del detector'
    ).toBe(false);
  });

  it('el detector reconoce la frase exacta que el prompt le ordena decir', () => {
    expect(haySenalDeAlarma(FRASE_ESCALADA)).toBe(true);
  });

  it('la frase sigue hablando de urgencia presencial', () => {
    // Si alguien la reescribe sin ese núcleo, el detector se queda ciego y esta
    // prueba lo dice antes de que pase en producción.
    expect(FRASE_ESCALADA.toLowerCase()).toContain('presencial urgente');
  });
});

describe('Detectar la escalada en un mensaje', () => {
  it('aguanta que el modelo cambie puntuación, mayúsculas o el emoji', () => {
    expect(haySenalDeAlarma('Esto REQUIERE ATENCIÓN MÉDICA PRESENCIAL URGENTE.')).toBe(true);
    expect(haySenalDeAlarma('esto requiere atencion medica presencial urgente')).toBe(true);
    expect(haySenalDeAlarma('⚠️  Esto   requiere   atención médica presencial urgente. Acude ya.')).toBe(true);
    expect(haySenalDeAlarma('Lo que me cuentas requiere atención médica presencial urgente, no esperes.')).toBe(true);
  });

  it('no se enciende con una conversación normal', () => {
    expect(haySenalDeAlarma('¿Desde cuándo tienes el dolor?')).toBe(false);
    expect(haySenalDeAlarma('Te recomiendo consultar con tu médico esta semana.')).toBe(false);
    expect(haySenalDeAlarma('Si se trata de una emergencia, llama al 123.')).toBe(false);
    expect(haySenalDeAlarma('')).toBe(false);
    expect(haySenalDeAlarma(undefined)).toBe(false);
    expect(haySenalDeAlarma(null)).toBe(false);
  });

  it('el aviso de pie que Hilda lleva siempre NO es una alarma', () => {
    // AVISO_URGENCIAS va pegado a cada mensaje de error del chat. Si lo contara
    // como alarma, el botón estaría rojo desde el primer fallo de red.
    expect(haySenalDeAlarma('Si se trata de una emergencia, por favor consulta a urgencias o llama al 123.')).toBe(false);
  });
});

describe('Detectar la escalada en la conversación', () => {
  const hilda = (texto: string) => ({ role: 'assistant', content: texto });
  const paciente = (texto: string) => ({ role: 'user', content: texto });

  it('se enciende con un mensaje de Hilda', () => {
    expect(alarmaEnLaConversacion([paciente('me duele el pecho'), hilda(FRASE_ESCALADA)])).toBe(true);
  });

  it('NO se enciende si quien lo escribe es el paciente', () => {
    expect(alarmaEnLaConversacion([paciente(FRASE_ESCALADA)])).toBe(false);
    expect(alarmaEnLaConversacion([paciente(`copio lo que me dijo otra app: ${FRASE_ESCALADA}`)])).toBe(false);
  });

  it('una vez encendida no se apaga, aunque Hilda siga preguntando', () => {
    const conversacion = [
      paciente('me duele el pecho'),
      hilda(FRASE_ESCALADA),
      paciente('ya voy'),
      hilda('¿Desde cuándo tienes el dolor?'),
      hilda('Cuéntame si te falta el aire.'),
    ];
    expect(alarmaEnLaConversacion(conversacion)).toBe(true);
  });

  it('una conversación vacía o sin alarma no enciende nada', () => {
    expect(alarmaEnLaConversacion([])).toBe(false);
    expect(alarmaEnLaConversacion(undefined)).toBe(false);
    expect(alarmaEnLaConversacion([paciente('hola'), hilda('Hola, cuéntame qué te pasa.')])).toBe(false);
  });
});

describe('El botón en la cabecera', () => {
  const cabecera = leer('src/components/chat/ChatHeader.tsx');

  it('existe sin depender de la alarma', () => {
    // La alarma solo entra en las clases (el color), nunca en una condición que
    // decida si el enlace se dibuja.
    expect(cabecera).toContain('/dashboard/urgencias');
    expect(
      /\{alarmaActiva &&\s*\(?\s*<Link/.test(cabecera),
      'el enlace a urgencias no puede estar detrás de alarmaActiva'
    ).toBe(false);
  });

  it('no marca directo: lleva a la pantalla', () => {
    const marcados = cabecera.match(/tel:/g) ?? [];
    expect(marcados, 'un toque accidental en la cabecera no puede llamar al 123').toEqual([]);
  });

  it('respeta a quien pide menos movimiento', () => {
    expect(cabecera).toContain('motion-reduce:animate-none');
  });
});

describe('La tarjeta de urgencias en Inicio', () => {
  const inicio = leer('src/components/dashboard/inicio.tsx');

  it('enlaza la pantalla de urgencias', () => {
    // Antes del 11-nov-2026 nada en la app la enlazaba: solo llegaba quien
    // escribiera la URL, y por eso el 131 de Chile duró meses ahí.
    expect(inicio).toContain('/dashboard/urgencias');
  });

  it('no marca directo desde Inicio', () => {
    expect(inicio.match(/tel:/g) ?? []).toEqual([]);
  });
});
