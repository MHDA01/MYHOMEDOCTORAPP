/**
 * @fileoverview Cliente de navegador para tokenizar tarjetas directamente contra Wompi.
 *
 * El número de tarjeta viaja del navegador a Wompi usando únicamente la llave
 * pública (segura de exponer por diseño) — nunca pasa por nuestro backend,
 * evitando que la app entre en alcance PCI-DSS para datos de tarjeta.
 */

const WOMPI_PUBLIC_KEY = process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY || "";

const WOMPI_HOSTNAME = WOMPI_PUBLIC_KEY.startsWith("pub_test_")
  ? "https://sandbox.wompi.co"
  : "https://production.wompi.co";

export interface WompiMerchantConsent {
  acceptanceToken: string;
  acceptancePermalink: string;
  personalAuthToken: string;
  personalAuthPermalink: string;
}

export async function fetchWompiConsent(): Promise<WompiMerchantConsent> {
  const res = await fetch(`${WOMPI_HOSTNAME}/v1/merchants/${WOMPI_PUBLIC_KEY}`);
  if (!res.ok) {
    throw new Error("No se pudo cargar los términos de Wompi");
  }
  const json = await res.json();
  const acceptance = json?.data?.presigned_acceptance;
  const personalAuth = json?.data?.presigned_personal_data_auth;

  if (!acceptance?.acceptance_token || !personalAuth?.acceptance_token) {
    throw new Error("Respuesta inesperada de Wompi al cargar términos");
  }

  return {
    acceptanceToken: acceptance.acceptance_token,
    acceptancePermalink: acceptance.permalink,
    personalAuthToken: personalAuth.acceptance_token,
    personalAuthPermalink: personalAuth.permalink,
  };
}

export interface CardInput {
  number: string;
  cvc: string;
  expMonth: string;
  expYear: string;
  cardHolder: string;
}

export async function tokenizeCard(card: CardInput): Promise<string> {
  const res = await fetch(`${WOMPI_HOSTNAME}/v1/tokens/cards`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${WOMPI_PUBLIC_KEY}`,
    },
    body: JSON.stringify({
      number: card.number.replace(/\s+/g, ""),
      cvc: card.cvc,
      exp_month: card.expMonth,
      exp_year: card.expYear,
      card_holder: card.cardHolder,
    }),
  });

  const json = await res.json();

  if (!res.ok || !json?.data?.id) {
    const message = json?.error?.messages
      ? Object.values(json.error.messages).flat().join(" ")
      : "La tarjeta fue rechazada. Verifica los datos.";
    throw new Error(message);
  }

  return json.data.id;
}
