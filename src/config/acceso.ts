/**
 * Interruptor de acceso libre.
 *
 * Decisión del fundador (13-sep-2026): la app es completamente gratis hasta llegar
 * a 1.000 usuarios; después se decide cuándo empezar a cobrar.
 *
 * Con `true`:
 * - getUserTokenState (src/lib/token-system.ts) responde siempre "disponible", así
 *   que ninguna consulta se bloquea por tokens.
 * - No se descuentan tokens al cerrar una consulta ni se crean pagos.
 * - La interfaz esconde "Comprar tokens", los contadores y la ventana de pago.
 *
 * No se borró nada del sistema de cobro: tokens, Wompi y suscripciones siguen en su
 * sitio, dormidos. Para volver a cobrar, poner `false` AQUÍ y en
 * functions/src/acceso.ts (los dos deben valer lo mismo) y desplegar ambos.
 *
 * Ojo al apagarlo: los usuarios que se registraron durante la etapa gratuita
 * tienen un documento de tokens con su período de prueba ya vencido por fecha, así
 * que al volver a cobrar quedarían bloqueados de inmediato. Hay que decidir antes
 * cómo tratarlos (p. ej. reiniciarles el período de prueba).
 */
export const ACCESO_LIBRE = true;
