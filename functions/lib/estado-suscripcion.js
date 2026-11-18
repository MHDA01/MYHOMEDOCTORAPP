"use strict";
/**
 * @fileoverview Qué le pasa al estado de la suscripción cuando Wompi confirma un cobro.
 * Vive aparte de `wompy.ts` para poder probarse desde `tests/`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.camposTrasCobroAprobado = camposTrasCobroAprobado;
/**
 * Campos de `Cuentas_Tutor/{uid}/tokens/config` que se escriben cuando el webhook
 * confirma un cobro **aprobado** (aparte de los tokens y `planExpires`).
 *
 * Un cobro recurrente aprobado vuelve a encender la renovación. Salvo que la
 * persona la haya cancelado mientras el cobro estaba en confirmación: su
 * cancelación se respeta. El cobro que ya entró sí cubre el mes (se abonan los
 * tokens), pero no se reactiva nada.
 */
function camposTrasCobroAprobado(actual, esRecurrente, siguienteCobro) {
    if (!esRecurrente)
        return {};
    if ((actual === null || actual === void 0 ? void 0 : actual.subscriptionStatus) === "cancelled")
        return {};
    return {
        autoRenew: true,
        subscriptionStatus: "active",
        nextBillingDate: siguienteCobro,
        failedChargeAttempts: 0,
    };
}
//# sourceMappingURL=estado-suscripcion.js.map