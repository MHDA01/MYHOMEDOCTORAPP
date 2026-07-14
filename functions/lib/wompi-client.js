"use strict";
/**
 * @fileoverview Cliente HTTP compartido para la API de Wompi (Bancolombia).
 * Usado tanto por el flujo de pago único (Payment Links) como por el de
 * pagos recurrentes (Payment Sources + Transactions).
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.WOMPI_HOSTNAME = void 0;
exports.wompiRequest = wompiRequest;
const https = __importStar(require("https"));
const WOMPY_PUBLIC_KEY = process.env.WOMPY_PUBLIC_KEY;
const WOMPY_PRIVATE_KEY = process.env.WOMPY_PRIVATE_KEY || process.env.WOMPY_API_KEY;
// Wompi usa entornos separados por prefijo de llave pública (pub_prod_ / pub_test_)
exports.WOMPI_HOSTNAME = (WOMPY_PUBLIC_KEY === null || WOMPY_PUBLIC_KEY === void 0 ? void 0 : WOMPY_PUBLIC_KEY.startsWith("pub_test_"))
    ? "sandbox.wompi.co"
    : "production.wompi.co";
function wompiRequest(method, path, body) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: exports.WOMPI_HOSTNAME,
            port: 443,
            path,
            method,
            servername: exports.WOMPI_HOSTNAME, // SNI (Server Name Indication) para TLS
            rejectUnauthorized: true, // Verificar certificado SSL
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
                    }
                    else {
                        reject(new Error(`Wompi API error: ${res.statusCode} ${data}`));
                    }
                }
                catch (e) {
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
//# sourceMappingURL=wompi-client.js.map