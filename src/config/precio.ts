/**
 * Precio del plan **Familias Fundadoras**.
 *
 * Esta constante y `CONSULTATION_COST_COP` de `functions/src/wompy.ts` **deben
 * valer lo mismo**, igual que `ACCESO_LIBRE`: la pantalla usa esta para
 * mostrar, y la función usa la otra para cobrarle a Wompi. Hasta el
 * 10-nov-2026 no valían lo mismo —la ventana de pago decía 19.900 y Wompi
 * cobraba 24.500—, y de ahí que el precio ya no se escriba a mano en ningún
 * componente: se importa de aquí.
 *
 * En la función el valor se puede mover sin desplegar, con la variable de
 * entorno `CONSULTATION_COST_COP`. Si la mueves allá, mueve este archivo en el
 * mismo cambio, o la pantalla volverá a mentir.
 */

/** Lo que se le cobra al mes, en pesos. */
export const PRECIO_MENSUAL_COP = 24_900;

/** El mismo precio ya escrito para mostrarlo: `$24.900`. */
export const PRECIO_MENSUAL_TEXTO = `$${PRECIO_MENSUAL_COP.toLocaleString('es-CO')}`;

/** Como se llama el plan de cara a la persona. */
export const NOMBRE_DEL_PLAN = 'Plan Familias Fundadoras';

/**
 * Cuántas consultas al mes trae el plan, **para todo el núcleo familiar**: el
 * saldo vive en la cuenta del titular (`Cuentas_Tutor/{uid}/tokens/config`) y
 * lo comparten todos los integrantes; no hay cupo por persona.
 *
 * Decisión de Alexander del 10-nov-2026: 100 al mes, unas 20 por integrante en
 * una familia de cinco. Antes eran 210 ("7 consultas/día"), que a los COP 135
 * por orientación medidos ese día costaban más de IA que lo que cobra el plan.
 *
 * Tiene que valer lo mismo que `PAID_TOKENS_PER_MONTH` en
 * `functions/src/wompy.ts`, que es el saldo que se abona de verdad al pagar.
 */
export const CONSULTAS_POR_MES = 100;
