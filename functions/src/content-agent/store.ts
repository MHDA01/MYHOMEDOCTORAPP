/**
 * @fileoverview Persistencia del agente de contenido: qué tema tocó la última vez
 * (para rotar sin repetir) y el historial de planes generados.
 */

import * as admin from "firebase-admin";
import { TREND_TOPICS } from "./topics";

try {
  admin.initializeApp();
} catch (_) {
  // Ya inicializado por otro módulo
}

const db = admin.firestore();
const CURSOR_REF = db.collection("ContentAgent").doc("cursor");
const PLANS_COLLECTION = db.collection("ContentAgent").doc("cursor").collection("plans");

/**
 * Toma los siguientes N temas de la rotación (sin repetir hasta agotar la lista)
 * y avanza el cursor de forma atómica.
 */
export async function takeNextTopics(count: number): Promise<string[]> {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(CURSOR_REF);
    const startIndex = (snap.exists ? (snap.data()?.topicIndex as number) : 0) || 0;

    const topics: string[] = [];
    for (let i = 0; i < count; i++) {
      topics.push(TREND_TOPICS[(startIndex + i) % TREND_TOPICS.length]);
    }

    tx.set(CURSOR_REF, { topicIndex: (startIndex + count) % TREND_TOPICS.length }, { merge: true });
    return topics;
  });
}

export interface StoredPost {
  weekday: string;
  formatLabel: string;
  topic: string;
  hook: string;
  caption: string;
  productionNote: string;
}

export async function savePlan(weekId: string, posts: StoredPost[]): Promise<void> {
  await PLANS_COLLECTION.doc(weekId).set({
    posts,
    generatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
