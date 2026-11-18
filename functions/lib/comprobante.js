"use strict";
/**
 * @fileoverview Envío del comprobante de un cobro aprobado.
 *
 * Lo llaman los tres caminos por los que un cobro se aprueba (alta de la
 * suscripción, cobro mensual y webhook de Wompi). Vive aparte para que
 * `subscription.ts` y `wompy.ts` no se importen entre sí.
 *
 * Nunca lanza: el cobro ya ocurrió y un fallo del correo no puede deshacerlo ni
 * esconder el pago; queda registrado en el log.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.enviarComprobante = enviarComprobante;
const email_1 = require("./email");
const correos_cobro_1 = require("./correos-cobro");
async function enviarComprobante(db, uid, datos) {
    var _a, _b;
    try {
        const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
        const correo = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.email;
        if (!correo) {
            console.warn(`[COMPROBANTE] ${uid} no tiene correo: no se envió el comprobante de ${datos.referencia}`);
            return;
        }
        const c = (0, correos_cobro_1.comprobanteDePago)(Object.assign(Object.assign({}, datos), { fecha: (_b = datos.fecha) !== null && _b !== void 0 ? _b : new Date() }));
        await (0, email_1.sendEmail)(correo, c.asunto, c.html);
    }
    catch (error) {
        console.error(`[COMPROBANTE] No se pudo enviar el comprobante de ${datos.referencia}:`, error);
    }
}
//# sourceMappingURL=comprobante.js.map