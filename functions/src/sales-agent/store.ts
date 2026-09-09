/**
 * @fileoverview Persistencia en Firestore del estado de conversación del agente de
 * ventas. Colección independiente de Cuentas_Tutor (estos leads todavía no son
 * usuarios registrados de la app): `SalesLeads/{channel}_{externalId}`.
 */

import * as admin from "firebase-admin";
import { Channel, LeadState, ChatMessage, SalesStage, CapturedVariables } from "./types";

try {
  admin.initializeApp();
} catch (_) {
  // Ya inicializado por otro módulo
}

const db = admin.firestore();
const LEADS_COLLECTION = "SalesLeads";
const HISTORY_LIMIT = 20; // últimos mensajes que se le mandan a Claude como contexto

function leadDocId(channel: Channel, externalId: string): string {
  return `${channel}_${externalId}`;
}

export function leadRef(channel: Channel, externalId: string): FirebaseFirestore.DocumentReference {
  return db.collection(LEADS_COLLECTION).doc(leadDocId(channel, externalId));
}

export async function getOrCreateLead(channel: Channel, externalId: string): Promise<LeadState> {
  const ref = leadRef(channel, externalId);
  const snap = await ref.get();

  if (snap.exists) {
    return snap.data() as LeadState;
  }

  const initial: LeadState = {
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

export async function appendMessage(
  channel: Channel,
  externalId: string,
  role: "user" | "assistant",
  text: string
): Promise<void> {
  await leadRef(channel, externalId)
    .collection("messages")
    .add({ role, text, at: admin.firestore.FieldValue.serverTimestamp() });
}

export async function getRecentHistory(channel: Channel, externalId: string): Promise<ChatMessage[]> {
  const snap = await leadRef(channel, externalId)
    .collection("messages")
    .orderBy("at", "desc")
    .limit(HISTORY_LIMIT)
    .get();

  return snap.docs
    .map((d) => {
      const data = d.data();
      return { role: data.role, text: data.text } as ChatMessage;
    })
    .reverse();
}

export async function updateLeadState(
  channel: Channel,
  externalId: string,
  stage: SalesStage,
  captured: CapturedVariables
): Promise<void> {
  await leadRef(channel, externalId).update({
    stage,
    captured,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
