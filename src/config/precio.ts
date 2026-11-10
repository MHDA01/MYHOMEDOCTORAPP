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
