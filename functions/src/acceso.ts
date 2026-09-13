/**
 * Interruptor de acceso libre para las Cloud Functions.
 *
 * DEBE valer lo mismo que src/config/acceso.ts (la app de Next.js se despliega
 * aparte). Con `true` no se descuentan tokens, no se renuevan tokens gratis, no se
 * cobran suscripciones ni se crean pagos. Ver la explicación completa allí.
 */
export const ACCESO_LIBRE = true;
