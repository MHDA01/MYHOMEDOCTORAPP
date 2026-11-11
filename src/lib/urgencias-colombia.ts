/**
 * La línea de emergencias de Colombia, en un solo lugar.
 *
 * Es todo lo que la pantalla de urgencias muestra, y es una decisión, no una
 * versión reducida de algo más grande. Lo que había antes y por qué se fue:
 *
 * - Hasta el 11-nov-2026 la pantalla marcaba `tel:131` ("Llamar al SAMU") y
 *   listaba cuatro prestadores chilenos como "nuestros proveedores". El SAMU y el
 *   131 son de Chile: en Colombia ese número no manda una ambulancia.
 * - Ese mismo día se construyó un directorio por EPS (línea nacional y sedes por
 *   ciudad, con fuente, fecha y caducidad). Se retiró el 11-nov-2026 por decisión
 *   de Alexander, y la razón es buena: no existe una fuente oficial de con qué
 *   prestador atiende cada EPS —esa red la publica cada EPS por su cuenta, y sus
 *   sitios no se pueden leer de forma fiable—, así que el directorio habría sido
 *   un dato de terceros envejeciendo en la única pantalla donde eso se paga caro.
 *
 * Y hay un motivo legal para que el 123 baste, que es el que cierra el asunto.
 * Ley Estatutaria 1751 de 2015 (texto compilado, leído el 11-nov-2026 en
 * https://cancilleria.gov.co/normograma/compilacion/docs/ley_1751_2015.htm):
 * el artículo 10, literal b), reconoce el derecho a recibir la atención de
 * urgencias con la oportunidad que la condición amerite, sin exigir documento ni
 * pago previo; y el artículo 14 dispone que para la atención de urgencia no se
 * requiere autorización administrativa entre el prestador y la entidad que
 * gestiona los servicios.
 *
 * O sea: **en una urgencia la EPS no es la puerta**. Preguntar por ella antes de
 * atender sería al revés de lo que dice la ley, y hacerlo en esta pantalla era
 * poner un trámite donde solo hace falta un número.
 *
 * La EPS sigue viviendo en la ficha de cada integrante (`eps-colombia.ts`), que es
 * donde sirve: el informe, el contexto que recibe Hilda y lo que viene después de
 * la urgencia —consulta prioritaria, autorizaciones, continuidad—.
 */

/** Línea única nacional de emergencias en Colombia. No es configurable. */
export const LINEA_EMERGENCIAS = '123';
