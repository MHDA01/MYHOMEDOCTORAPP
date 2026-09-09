"use strict";
/**
 * @fileoverview Persistencia en Firestore del estado de conversación del agente de
 * ventas. Colección independiente de Cuentas_Tutor (estos leads todavía no son
 * usuarios registrados de la app): `SalesLeads/{channel}_{externalId}`.
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
exports.leadRef = leadRef;
exports.getOrCreateLead = getOrCreateLead;
exports.appendMessage = appendMessage;
exports.getRecentHistory = getRecentHistory;
exports.updateLeadState = updateLeadState;
const admin = __importStar(require("firebase-admin"));
try {
    admin.initializeApp();
}
catch (_) {
    // Ya inicializado por otro módulo
}
const db = admin.firestore();
const LEADS_COLLECTION = "SalesLeads";
const HISTORY_LIMIT = 20; // últimos mensajes que se le mandan a Claude como contexto
function leadDocId(channel, externalId) {
    return `${channel}_${externalId}`;
}
function leadRef(channel, externalId) {
    return db.collection(LEADS_COLLECTION).doc(leadDocId(channel, externalId));
}
async function getOrCreateLead(channel, externalId) {
    const ref = leadRef(channel, externalId);
    const snap = await ref.get();
    if (snap.exists) {
        return snap.data();
    }
    const initial = {
        channel,
        externalId,
        stage: "apertura",
        captured: { acepto_o_rechazo_oferta: "pendiente" },
        converted: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(initial);
    return initial;
}
async function appendMessage(channel, externalId, role, text) {
    await leadRef(channel, externalId)
        .collection("messages")
        .add({ role, text, at: admin.firestore.FieldValue.serverTimestamp() });
}
async function getRecentHistory(channel, externalId) {
    const snap = await leadRef(channel, externalId)
        .collection("messages")
        .orderBy("at", "desc")
        .limit(HISTORY_LIMIT)
        .get();
    return snap.docs
        .map((d) => {
        const data = d.data();
        return { role: data.role, text: data.text };
    })
        .reverse();
}
async function updateLeadState(channel, externalId, stage, captured) {
    await leadRef(channel, externalId).update({
        stage,
        captured,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
//# sourceMappingURL=store.js.map