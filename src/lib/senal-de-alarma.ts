/**
 * Detectar, dentro de la conversación, que Hilda acaba de escalar.
 *
 * Para qué sirve: encender el botón de urgencias en la cabecera del chat.
 * Decisión de Alexander (11-nov-2026) y conviene leer el matiz, porque no es lo
 * que se pidió primero. La idea inicial era que el botón **apareciera** con la
 * alarma. Eso lo vuelve un botón ausente justo cuando la detección falla, y el
 * falso negativo es el fallo grave que el arnés del grafo mide aparte. Así que
 * el botón **está siempre**, callado, y esto solo lo **enciende**.
 *
 * Esa asimetría manda en todo el archivo: encenderlo de más cuesta un botón rojo
 * que nadie usó; no encenderlo no quita el camino, solo lo deja discreto. Por eso
 * el detector puede ser generoso, pero nunca es la única puerta.
 *
 * ⚠️ LO QUE ESTO NO ES. No es un detector clínico: no mira los síntomas del
 * paciente ni decide nada. Mira **lo que Hilda ya respondió**, que es una
 * decisión que el modelo tomó antes. Si el modelo no escaló, aquí no hay nada que
 * encontrar. La alarma de verdad —determinista, en cada turno, sin depender del
 * modelo— es la del grafo (`grafo-ejecutor.ts`), que todavía no está conectada al
 * chat porque le falta el extractor de texto libre a hallazgos tipados. El día
 * que exista, este archivo se reemplaza por ella y no al revés.
 */

/**
 * La frase de escalada, **en un solo lugar**. El prompt de Hilda la interpola
 * (`teleorientacion.ts`, sección 3) y el detector la busca, así que no pueden
 * separarse sin que una prueba lo note. Es texto clínico visible: cambiarla exige
 * aprobación del fundador. El texto vigente lo aprobó Alexander el 18-nov-2026.
 */
export const FRASE_ESCALADA =
  '⚠️ Esto requiere atención médica presencial urgente. Por favor acude a urgencias o llama a tu médico de inmediato.';

/**
 * El trozo que se busca de verdad. Es el núcleo de `FRASE_ESCALADA`, sin emoji y
 * sin la segunda oración: así el detector sigue funcionando si el modelo cambia
 * la puntuación, se come el emoji o parte la frase en dos. Si alguien edita la
 * frase y este núcleo deja de estar dentro, una prueba falla.
 */
const NUCLEO = 'requiere atencion medica presencial urgente';

/** Sin tildes, sin mayúsculas y con los espacios colapsados. */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** ¿Este mensaje de Hilda es una escalada? */
export function haySenalDeAlarma(texto: string | undefined | null): boolean {
  if (!texto) return false;
  return normalizar(texto).includes(NUCLEO);
}

/**
 * ¿Hilda escaló en algún momento de esta conversación?
 *
 * Una vez encendido, **no se apaga**: la misma regla que `nivelFinal()`, donde un
 * nivel nunca baja. Si Hilda dijo que esto requiere atención urgente y después
 * sigue preguntando detalles, el botón no debe desaparecer a mitad de camino.
 *
 * Solo se miran los mensajes de Hilda. Lo que el paciente escriba —aunque copie
 * la frase— no enciende nada: el botón diría que hay una alarma que nadie evaluó.
 */
export function alarmaEnLaConversacion(
  mensajes: readonly { autor?: string; role?: string; texto?: string; content?: string }[] | undefined
): boolean {
  if (!mensajes?.length) return false;
  return mensajes.some((m) => {
    const quien = (m.autor ?? m.role ?? '').toLowerCase();
    const esDeHilda = quien === 'assistant' || quien === 'hilda' || quien === 'model' || quien === 'bot';
    if (!esDeHilda) return false;
    return haySenalDeAlarma(m.texto ?? m.content);
  });
}
