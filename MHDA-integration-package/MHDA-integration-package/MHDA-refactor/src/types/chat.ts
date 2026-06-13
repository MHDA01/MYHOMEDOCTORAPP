// ============================================================
// types/chat.ts — Tipos compartidos para el chat de teleorientación
// ============================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface FamilyMember {
  id: string;
  nombre: string;
  parentesco: string;
  edad: number;
  sexo: 'Masculino' | 'Femenino';
}

export interface UserProfile {
  uid: string;
  nombre: string;
  edad: number;
  sexo: string;
  alergias?: string[];
  familyMembers?: FamilyMember[];
}

export type TriageLevel = 'roja' | 'amarilla' | 'verde' | null;

export interface ChatSession {
  id: string;
  memberId: string;
  memberName: string;
  messages: ChatMessage[];
  triageLevel: TriageLevel;
  createdAt: Date;
  updatedAt: Date;
}
