"use strict";
/**
 * @fileoverview Persistencia del agente de contenido: qué tema tocó la última vez
 * (para rotar sin repetir) y el historial de planes generados.
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
exports.takeNextTopics = takeNextTopics;
exports.savePlan = savePlan;
const admin = __importStar(require("firebase-admin"));
const topics_1 = require("./topics");
try {
    admin.initializeApp();
}
catch (_) {
    // Ya inicializado por otro módulo
}
const db = admin.firestore();
const CURSOR_REF = db.collection("ContentAgent").doc("cursor");
const PLANS_COLLECTION = db.collection("ContentAgent").doc("cursor").collection("plans");
/**
 * Toma los siguientes N temas de la rotación (sin repetir hasta agotar la lista)
 * y avanza el cursor de forma atómica.
 */
async function takeNextTopics(count) {
    return db.runTransaction(async (tx) => {
        var _a;
        const snap = await tx.get(CURSOR_REF);
        const startIndex = (snap.exists ? (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.topicIndex : 0) || 0;
        const topics = [];
        for (let i = 0; i < count; i++) {
            topics.push(topics_1.TREND_TOPICS[(startIndex + i) % topics_1.TREND_TOPICS.length]);
        }
        tx.set(CURSOR_REF, { topicIndex: (startIndex + count) % topics_1.TREND_TOPICS.length }, { merge: true });
        return topics;
    });
}
async function savePlan(weekId, posts) {
    await PLANS_COLLECTION.doc(weekId).set({
        posts,
        generatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}
//# sourceMappingURL=store.js.map