/**
 * @fileoverview Tipos compartidos del agente de ventas conversacional
 * (WhatsApp + Instagram) de My Home Doctor.
 */

export type Channel = "whatsapp" | "instagram";

export type SalesStage =
  | "apertura"
  | "mini_diagnostico"
  | "presentacion_valor"
  | "manejo_objeciones"
  | "cierre"
  | "cerrado_pago"
  | "cerrado_rechazo";

export interface CapturedVariables {
  nombre_usuario?: string;
  sintoma_inicial?: string;
  email?: string;
  acepto_o_rechazo_oferta?: "pendiente" | "acepto" | "rechazo";
  motivo_rechazo_si_aplica?: string;
}

export interface LeadState {
  channel: Channel;
  externalId: string;
  stage: SalesStage;
  captured: CapturedVariables;
  converted: boolean;
  createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp;
  paymentReference?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
