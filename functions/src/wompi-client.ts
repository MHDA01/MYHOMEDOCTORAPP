/**
 * @fileoverview Cliente HTTP compartido para la API de Wompi (Bancolombia).
 * Usado tanto por el flujo de pago único (Payment Links) como por el de
 * pagos recurrentes (Payment Sources + Transactions).
 */

import * as https from "https";

const WOMPY_PUBLIC_KEY = process.env.WOMPY_PUBLIC_KEY;
const WOMPY_PRIVATE_KEY = process.env.WOMPY_PRIVATE_KEY || process.env.WOMPY_API_KEY;

// Wompi usa entornos separados por prefijo de llave pública (pub_prod_ / pub_test_)
export const WOMPI_HOSTNAME = WOMPY_PUBLIC_KEY?.startsWith("pub_test_")
  ? "sandbox.wompi.co"
  : "production.wompi.co";

export function wompiRequest(
  method: string,
  path: string,
  body?: Record<string, any>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: WOMPI_HOSTNAME,
      port: 443,
      path,
      method,
      servername: WOMPI_HOSTNAME, // SNI (Server Name Indication) para TLS
      rejectUnauthorized: true,     // Verificar certificado SSL
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WOMPY_PRIVATE_KEY}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(`Wompi API error: ${res.statusCode} ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse Wompi response: ${data}`));
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}
