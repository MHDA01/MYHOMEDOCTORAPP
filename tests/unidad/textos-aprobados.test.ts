/**
 * Los textos clínicos visibles que Alexander aprobó el 18-nov-2026.
 *
 * La regla de la casa (`CLAUDE.md`) es que todo texto clínico visible lo aprueba
 * él. Hasta esa fecha había 17 piezas **publicadas sin aprobación**: salieron a
 * producción antes de la firma por decisión suya del 11 y del 18 de noviembre, y
 * eso era deuda, no un borrador. En la sesión de aprobación del 18-nov se leyeron
 * una por una y quedaron firmadas las 17.
 *
 * Para qué sirve esta prueba: para que **la firma signifique algo**. Sin ella,
 * cualquiera —persona o modelo— puede reescribir una de estas frases en un
 * refactor y publicarla el mismo día, porque desde el 18-nov un push a `master`
 * ya despliega. Si una cambia, esto falla y obliga a pedir una aprobación nueva en
 * vez de dejarlo pasar.
 *
 * Lo que esta prueba NO dice es que el texto sea bueno: dice que es el que se
 * aprobó. Para cambiar uno: se le pregunta a Alexander, y con su visto bueno se
 * cambian el código y esta lista en el mismo commit, con la fecha nueva.
 *
 * Nota de implementación: se compara con los espacios colapsados, porque en JSX
 * una frase larga queda partida en varias líneas con sangría.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { AVISO_INFORME } from '../../src/lib/informe-orientacion-pdf';
import { FRASE_ESCALADA } from '../../src/lib/senal-de-alarma';

const RAIZ = join(__dirname, '..', '..');

/** Un solo espacio entre palabras: así da igual cómo esté partida la línea. */
function normalizar(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

const cache = new Map<string, string>();
function leer(ruta: string): string {
  if (!cache.has(ruta)) cache.set(ruta, normalizar(readFileSync(join(RAIZ, ruta), 'utf8')));
  return cache.get(ruta)!;
}

const URGENCIAS = 'src/components/dashboard/urgencias-page.tsx';
const INICIO = 'src/components/dashboard/inicio.tsx';
const CABECERA = 'src/components/chat/ChatHeader.tsx';
const FICHA = 'src/components/familia/formulario-integrante.tsx';
const REGISTRO = 'src/components/auth/register-form.tsx';
const MIS_DATOS = 'src/app/dashboard/cuenta/mis-datos/page.tsx';

const APROBADOS: { id: string; ruta: string; texto: string }[] = [
  // A · Urgencias (5 textos, 7 fragmentos)
  { id: 'A1 título de urgencias', ruta: URGENCIAS, texto: 'Si hay riesgo para la vida, llama al {LINEA_EMERGENCIAS}' },
  {
    id: 'A2 qué es el 123',
    ruta: URGENCIAS,
    texto:
      'es la línea única de emergencias en Colombia. Atiende todo el día, todos los días, desde cualquier teléfono, y no te pueden pedir documento ni pago para atenderte.',
  },
  { id: 'A3 título de la segunda tarjeta', ruta: URGENCIAS, texto: '¿No sabes si es una urgencia?' },
  {
    id: 'A3 qué hace Hilda',
    ruta: URGENCIAS,
    texto:
      'Cuéntale a Hilda qué está pasando y te dice qué tan pronto hay que buscar atención y con quién. No reemplaza a un médico y no receta.',
  },
  { id: 'A4 franja de Inicio', ruta: INICIO, texto: 'Si hay riesgo para la vida, llama al {LINEA_EMERGENCIAS}' },
  {
    id: 'A5 etiqueta del botón encendido',
    ruta: CABECERA,
    texto: 'Hilda recomienda atención urgente. Ver qué hacer y llamar al ${LINEA_EMERGENCIAS}',
  },
  { id: 'A5 etiqueta del botón apagado', ruta: CABECERA, texto: 'Urgencias y línea ${LINEA_EMERGENCIAS}' },

  // B · La ficha de cada integrante
  { id: 'B1 ¿cuál EPS?', ruta: FICHA, texto: 'Es la que aparece en el carné. Queda en la ficha de salud y en el informe.' },
  { id: 'B2 municipio', ruta: FICHA, texto: 'Opcional. Queda en la ficha de salud.' },

  // C · El registro
  {
    id: 'C1 por qué la edad y el sexo',
    ruta: REGISTRO,
    texto: 'La edad y el sexo cambian lo que hay que revisar, así que los necesitamos desde el principio.',
  },
  { id: 'C2 faltan edad y sexo', ruta: REGISTRO, texto: 'Faltan la fecha de nacimiento y el sexo' },
  {
    id: 'C2 por qué los necesitamos',
    ruta: REGISTRO,
    texto: 'Los necesitamos para orientarte bien: la edad y el sexo cambian lo que hay que revisar.',
  },

  // D · Mis datos (Ley 1581 de 2012)
  { id: 'D1 encabezado', ruta: MIS_DATOS, texto: 'Lo que MyHomeDoctorApp guarda de tu familia está en tus manos.' },
  {
    id: 'D2 llévate una copia',
    ruta: MIS_DATOS,
    texto:
      'Descarga lo que guardamos de tu cuenta: tus datos y los de tu familia, tus conversaciones con Hilda, tus informes y tus documentos. Es un archivo que puedes guardar o llevar a otro servicio.',
  },
  {
    id: 'D3 tras descargar',
    ruta: MIS_DATOS,
    texto: 'Tu copia se descargó. Guárdala en un lugar seguro: trae datos de salud de tu familia.',
  },
  {
    id: 'D4 qué se borra',
    ruta: MIS_DATOS,
    texto:
      'Se borra todo: tu cuenta, los perfiles de tu familia, sus historias, tus conversaciones con Hilda, tus informes y tus documentos. No se puede deshacer y no hay copia que podamos devolverte después.',
  },
  {
    id: 'D5 descarga primero',
    ruta: MIS_DATOS,
    texto: 'Descarga primero tu copia si quieres conservar algo: después ya no se puede.',
  },
  {
    id: 'D6 volver a registrarse',
    ruta: MIS_DATOS,
    texto:
      'Si más adelante vuelves a registrarte será una cuenta nueva, con las condiciones de acceso que haya en ese momento.',
  },
  {
    id: 'D7 la constancia que no se borra',
    ruta: MIS_DATOS,
    texto:
      'Solo se conserva la constancia de qué profesional abrió una consulta y cuándo, sin ningún dato de salud: es el registro de quién vio tus datos.',
  },
];

describe('Textos clínicos aprobados el 18-nov-2026', () => {
  it.each(APROBADOS)('$id sigue literal', ({ ruta, texto }) => {
    const esperado = normalizar(texto);
    expect(
      leer(ruta).includes(esperado),
      `Este texto está aprobado y cambió. No lo "arregles" aquí: pídele a Alexander una aprobación nueva y actualiza el código y esta lista en el mismo commit.\n\n  ${esperado}`
    ).toBe(true);
  });

  it('E1 AVISO_INFORME es el aprobado, palabra por palabra', () => {
    // Va al pie de CADA página de CADA informe, que es el documento que la
    // persona le muestra a un médico. Llevaba pendiente desde octubre.
    expect(AVISO_INFORME).toBe(
      'Este documento es un informe de teleorientación en salud. No es un diagnóstico, ni una fórmula médica, ni una orden de exámenes, y no reemplaza la consulta con un profesional.'
    );
  });

  it('la frase de escalada de Hilda sigue siendo la aprobada', () => {
    // No era de los 17 —viene de antes, con el prompt— pero el detector que
    // enciende el botón de urgencias depende de ella: que no cambie sola.
    expect(FRASE_ESCALADA).toContain('requiere atención médica presencial urgente');
  });

  it('están los 19 fragmentos de los 17 textos aprobados', () => {
    // 19 y no 17 porque A3, A5 y C2 llevan título y cuerpo por separado; E1 se
    // comprueba por constante, no leyendo el archivo.
    expect(APROBADOS).toHaveLength(19);
    expect(new Set(APROBADOS.map((a) => a.id)).size).toBe(19);
  });
});
