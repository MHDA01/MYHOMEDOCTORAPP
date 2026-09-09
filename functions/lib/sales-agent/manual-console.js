"use strict";
/**
 * @fileoverview Consola manual de Dra. Hilda: mientras el webhook automático de
 * Meta sigue bloqueado, esto deja responder a leads a mano (copiar/pegar) usando
 * el mismo motor (processInboundMessage) que usará el bot cuando se active. La
 * conversación queda guardada en el mismo Firestore, así que no se pierde nada.
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
exports.manualAgentConsole = exports.manualAgentReply = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const engine_1 = require("./engine");
const SALES_CONSOLE_SECRET = process.env.SALES_CONSOLE_SECRET;
function isAuthorized(req) {
    if (!SALES_CONSOLE_SECRET)
        return false;
    const headerSecret = req.get("x-console-secret");
    const querySecret = req.query.secret;
    return headerSecret === SALES_CONSOLE_SECRET || querySecret === SALES_CONSOLE_SECRET;
}
/** API: recibe lo que escribió el lead, devuelve la respuesta de Dra. Hilda (no envía nada). */
exports.manualAgentReply = functions
    .region("us-central1")
    .runWith({ timeoutSeconds: 60 })
    .https.onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Método no permitido" });
        return;
    }
    if (!isAuthorized(req)) {
        res.status(403).json({ error: "No autorizado" });
        return;
    }
    const { channel, externalId, message } = req.body || {};
    if ((channel !== "whatsapp" && channel !== "instagram") || !externalId || !message) {
        res.status(400).json({ error: "Faltan channel ('whatsapp'|'instagram'), externalId o message" });
        return;
    }
    try {
        const result = await (0, engine_1.processInboundMessage)(channel, String(externalId), String(message));
        res.status(200).json(result);
    }
    catch (error) {
        console.error("[MANUAL CONSOLE] Error generando respuesta:", error);
        res.status(500).json({ error: error.message || "Error generando la respuesta" });
    }
});
const CONSOLE_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Consola de Dra. Hilda</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    background: #f4f7fa; color: #1e293b; margin: 0; padding: 20px 16px 60px;
  }
  .wrap { max-width: 560px; margin: 0 auto; }
  h1 { font-size: 19px; margin: 0 0 4px; color: #1a365d; }
  p.sub { color: #5c6b81; font-size: 13px; margin: 0 0 20px; }
  label { display: block; font-size: 12.5px; font-weight: 600; color: #5c6b81; margin: 14px 0 6px; }
  input, select, textarea {
    width: 100%; padding: 10px 12px; border: 1px solid #dde5ee; border-radius: 8px;
    font-size: 14px; font-family: inherit; background: #fff; color: #1e293b;
  }
  textarea { min-height: 90px; resize: vertical; }
  button {
    margin-top: 18px; width: 100%; padding: 12px; border: none; border-radius: 8px;
    background: #0ea371; color: #fff; font-size: 14px; font-weight: 700; cursor: pointer;
  }
  button:disabled { background: #9fb0c3; cursor: default; }
  .status { font-size: 12.5px; color: #5c6b81; margin-top: 10px; }
  .reply-card {
    margin-top: 14px; background: #fff; border: 1px solid #dde5ee; border-radius: 10px;
    padding: 14px 16px;
  }
  .reply-card p { white-space: pre-wrap; font-size: 14px; margin: 0 0 10px; }
  .reply-card button.copy {
    margin: 0; width: auto; padding: 6px 12px; font-size: 12.5px; background: #1a365d;
  }
  .meta { margin-top: 16px; font-size: 12px; color: #5c6b81; background: #e7edf6; border-radius: 8px; padding: 10px 12px; }
  .error { color: #b91c1c; font-size: 13px; margin-top: 10px; }
  .gate { max-width: 320px; margin: 60px auto; text-align: center; }
</style>
</head>
<body>
<div class="wrap" id="app"></div>
<script>
const FN_URL = window.location.href.replace('manualAgentConsole', 'manualAgentReply');

function getSecret() { return localStorage.getItem('drahilda_secret') || ''; }
function setSecret(s) { localStorage.setItem('drahilda_secret', s); }

function renderGate() {
  document.getElementById('app').innerHTML =
    '<div class="gate"><h1>Consola de Dra. Hilda</h1>' +
    '<p class="sub">Ingresa el secreto configurado en SALES_CONSOLE_SECRET</p>' +
    '<input id="secretInput" type="password" placeholder="Secreto" />' +
    '<button id="secretBtn">Entrar</button></div>';
  document.getElementById('secretBtn').onclick = function () {
    var v = document.getElementById('secretInput').value.trim();
    if (v) { setSecret(v); renderApp(); }
  };
}

function renderApp() {
  document.getElementById('app').innerHTML =
    '<h1>Consola de Dra. Hilda</h1>' +
    '<p class="sub">Pega lo que escribió el lead, copia la respuesta y pégala tú mismo en Instagram/WhatsApp.</p>' +
    '<label>Canal</label>' +
    '<select id="channel"><option value="instagram">Instagram</option><option value="whatsapp">WhatsApp</option></select>' +
    '<label>Identificador del lead (usuario de IG, número, o un apodo — debe ser el mismo cada vez para la misma persona)</label>' +
    '<input id="externalId" placeholder="ej. juan_perez_ig" />' +
    '<label>Mensaje del lead</label>' +
    '<textarea id="message" placeholder="Pega aquí lo que te escribió..."></textarea>' +
    '<button id="sendBtn">Generar respuesta de Dra. Hilda</button>' +
    '<div id="result"></div>';
  document.getElementById('sendBtn').onclick = submit;
}

async function submit() {
  var btn = document.getElementById('sendBtn');
  var resultEl = document.getElementById('result');
  var channel = document.getElementById('channel').value;
  var externalId = document.getElementById('externalId').value.trim();
  var message = document.getElementById('message').value.trim();

  if (!externalId || !message) {
    resultEl.innerHTML = '<p class="error">Falta el identificador del lead o el mensaje.</p>';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Pensando...';
  resultEl.innerHTML = '';

  try {
    var res = await fetch(FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-console-secret': getSecret() },
      body: JSON.stringify({ channel: channel, externalId: externalId, message: message }),
    });

    if (res.status === 403) {
      localStorage.removeItem('drahilda_secret');
      renderGate();
      return;
    }

    var data = await res.json();

    if (!res.ok) {
      resultEl.innerHTML = '<p class="error">' + (data.error || 'Error generando la respuesta') + '</p>';
      return;
    }

    if (data.converted) {
      resultEl.innerHTML = '<div class="meta">Este lead ya está marcado como convertido (pagó). No se generó respuesta nueva.</div>';
      return;
    }

    resultEl.innerHTML = '';
    (data.replies || []).forEach(function (reply) {
      var card = document.createElement('div');
      card.className = 'reply-card';
      var p = document.createElement('p');
      p.textContent = reply;
      var copyBtn = document.createElement('button');
      copyBtn.className = 'copy';
      copyBtn.textContent = 'Copiar';
      copyBtn.addEventListener('click', function () {
        navigator.clipboard.writeText(p.textContent);
        copyBtn.textContent = 'Copiado';
        setTimeout(function () { copyBtn.textContent = 'Copiar'; }, 1500);
      });
      card.appendChild(p);
      card.appendChild(copyBtn);
      resultEl.appendChild(card);
    });
    var meta = document.createElement('div');
    meta.className = 'meta';
    meta.innerHTML = 'Etapa: <b>' + data.stage + '</b><br>Capturado: ' +
      JSON.stringify(data.captured).replace(/</g, '&lt;');
    resultEl.appendChild(meta);

    document.getElementById('message').value = '';
  } catch (err) {
    resultEl.innerHTML = '<p class="error">Error de red: ' + err.message + '</p>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generar respuesta de Dra. Hilda';
  }
}

if (getSecret()) { renderApp(); } else { renderGate(); }
</script>
</body>
</html>`;
/** Sirve la página de la consola manual. */
exports.manualAgentConsole = functions
    .region("us-central1")
    .https.onRequest((_req, res) => {
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(CONSOLE_HTML);
});
//# sourceMappingURL=manual-console.js.map