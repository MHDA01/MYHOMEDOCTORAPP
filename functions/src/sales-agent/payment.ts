/**
 * @fileoverview Generación de link de pago Wompi para leads del agente de ventas
 * (todavía sin cuenta en Cuentas_Tutor). Reutiliza el cliente HTTP de Wompi existente
 * (`wompi-client.ts`) sin tocar el flujo de pago de usuarios ya registrados.
 *
 * El `reference` sigue el formato `lead_{channel}_{externalId}_{timestamp}` — como
 * channel y externalId (teléfono / IGSID) nunca traen guion bajo, `leadWompiWebhook`
 * lo puede partir de vuelta de forma confiable.
 */

import * as admin from "firebase-admin";
import { wompiRequest } from "../wompi-client";
import { leadRef } from "./store";
import { Channel } from "./types";
import { FOUNDER_PRICE_COP } from "./prompt";

const REDIRECT_URL =
  process.env.SALES_AGENT_REDIRECT_URL || "https://myhomedoctorapp.web.app/dashboard/teleorientacion";

export async function createLeadPaymentLink(
  channel: Channel,
  externalId: string,
  email: string,
  nombre?: string
): Promise<string> {
  const reference = `lead_${channel}_${externalId}_${Date.now()}`;

  const wompyPayload: Record<string, unknown> = {
    name: "Suscripción Fundador My Home Doctor",
    description: `Plan Teleorientación Mensual - Precio Fundador ($${FOUNDER_PRICE_COP.toLocaleString(
      "es-CO"
    )} COP)`,
    single_use: true,
    collect_shipping: false,
    currency: "COP",
    amount_in_cents: FOUNDER_PRICE_COP * 100,
    redirect_url: REDIRECT_URL,
  };

  const wompyResponse = await wompiRequest("POST", "/v1/payment_links", wompyPayload);
  const wompyId = wompyResponse?.data?.id;
  if (!wompyId) {
    throw new Error(`Respuesta inesperada de Wompi al crear link de lead: ${JSON.stringify(wompyResponse)}`);
  }
  const paymentUrl = `https://checkout.wompi.co/l/${wompyId}`;

  const ref = leadRef(channel, externalId);

  await ref.update({
    paymentReference: reference,
    email,
    stage: "cierre",
  });

  await ref.collection("transactions").add({
    wompy_id: wompyId,
    amount: FOUNDER_PRICE_COP,
    status: "pending",
    reference,
    payment_url: paymentUrl,
    customer_email: email,
    customer_name: nombre || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return paymentUrl;
}
