"use strict";
/**
 * @fileoverview Texto de los correos de cobro que no dependen de Firebase.
 * Vive aparte de `subscription.ts` para poder probarse desde `tests/`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.URL_MI_CUENTA = void 0;
exports.comprobanteDePago = comprobanteDePago;
exports.correoCancelacion = correoCancelacion;
exports.URL_MI_CUENTA = "https://myhomedoctorapp.com/dashboard/cuenta";
function fechaEnPalabras(fecha) {
    return fecha.toLocaleDateString("es-CO", {
        timeZone: "America/Bogota",
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
function fechaYHora(fecha) {
    return fecha.toLocaleString("es-CO", {
        timeZone: "America/Bogota",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    });
}
function escapar(texto) {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
/**
 * Comprobante de un cobro aprobado: lo que la persona necesita para saber qué se
 * le cobró, cuándo, y qué número dar si pregunta por ese pago. No inventa nada:
 * si no se conoce el próximo cobro o el id de Wompi, esa línea no sale.
 */
function comprobanteDePago(o) {
    var _a;
    const url = (_a = o.urlCuenta) !== null && _a !== void 0 ? _a : exports.URL_MI_CUENTA;
    const valor = `$${o.valorCop.toLocaleString("es-CO")} COP`;
    const fila = (nombre, valorFila) => `<tr><td style="padding:4px 16px 4px 0;color:#555">${nombre}</td><td style="padding:4px 0"><strong>${valorFila}</strong></td></tr>`;
    const filas = [
        fila("Concepto", escapar(o.concepto)),
        fila("Valor", valor),
        fila("Fecha y hora", fechaYHora(o.fecha)),
        o.consultas ? fila("Consultas incluidas", String(o.consultas)) : "",
        fila("Número de referencia", escapar(o.referencia)),
        o.idWompi ? fila("Transacción en Wompi", escapar(String(o.idWompi))) : "",
    ].join("");
    const proximo = o.proximoCobro && !Number.isNaN(o.proximoCobro.getTime())
        ? `<p>Tu próximo cobro será el <strong>${fechaEnPalabras(o.proximoCobro)}</strong>. Te avisaremos 3 días antes y puedes cancelarlo cuando quieras desde <a href="${url}">Mi cuenta</a>.</p>`
        : "";
    return {
        asunto: `Comprobante de pago: ${valor}`,
        html: `<p>Hola,</p>
<p>Recibimos tu pago. Este es tu comprobante:</p>
<table style="border-collapse:collapse">${filas}</table>
<p>Guarda el número de referencia: es el que necesitas si consultas por este pago.</p>
${proximo}<p>Puedes ver todos tus pagos en <a href="${url}">Mi cuenta</a>.</p>`,
    };
}
/**
 * Constancia de que la renovación quedó cancelada. Dice hasta cuándo hay acceso
 * y que no habrá más cobros; si había un cobro en confirmación, lo dice también,
 * porque ese sí puede completarse.
 */
function correoCancelacion(opciones) {
    var _a;
    const url = (_a = opciones.urlCuenta) !== null && _a !== void 0 ? _a : exports.URL_MI_CUENTA;
    const hasta = opciones.accesoHasta && !Number.isNaN(opciones.accesoHasta.getTime())
        ? `hasta el <strong>${fechaEnPalabras(opciones.accesoHasta)}</strong>`
        : "hasta el final del período que ya pagaste";
    const confirmacion = opciones.cobroEnConfirmacion
        ? `<p>Tenías un pago en confirmación con el banco. Si se aprueba, cubre este mes; después de ese pago no se te cobrará nada más.</p>`
        : "";
    return {
        asunto: "Cancelamos tu renovación",
        html: `<p>Hola,</p>
<p>Cancelamos la renovación automática de tu Plan Familias Fundadoras. Tendrás acceso ${hasta} y no te cobraremos más.</p>
${confirmacion}<p>Si cambias de opinión, puedes volver a activarla cuando quieras desde <a href="${url}">Mi cuenta</a>.</p>`,
    };
}
//# sourceMappingURL=correos-cobro.js.map