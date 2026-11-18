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

import { sendEmail } from "./email";
import { comprobanteDePago } from "./correos-cobro";

type Firestore = FirebaseFirestore.Firestore;

export async function enviarComprobante(
  db: Firestore,
  uid: string,
  datos: {
    valorCop: number;
    referencia: string;
    idWompi?: string | null;
    concepto: string;
    consultas?: number | null;
    proximoCobro?: Date | null;
    fecha?: Date;
  }
): Promise<void> {
  try {
    const userDoc = await db.collection("Cuentas_Tutor").doc(uid).get();
    const correo = userDoc.data()?.email;
    if (!correo) {
      console.warn(`[COMPROBANTE] ${uid} no tiene correo: no se envió el comprobante de ${datos.referencia}`);
      return;
    }
    const c = comprobanteDePago({ ...datos, fecha: datos.fecha ?? new Date() });
    await sendEmail(correo, c.asunto, c.html);
  } catch (error) {
    console.error(`[COMPROBANTE] No se pudo enviar el comprobante de ${datos.referencia}:`, error);
  }
}
