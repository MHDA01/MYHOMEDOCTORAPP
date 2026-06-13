import type { HealthInfo } from './types';

export type ConversationTurn = {
  id: string;
  role: 'user' | 'avatar';
  content: string;
  timestamp: Date;
  extractedFactIds: string[];
};

export type ExtractedClinicalFact = {
  id: string;
  memberId: string;
  sessionId: string;
  turnId: string;
  type: 'symptom' | 'condition' | 'medication' | 'allergy' | 'vital' | 'procedure';
  value: string;
  onset?: string;
  duration?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  confidence: number;
  source: 'chat' | 'form' | 'document';
  extractedAt: Date;
  version: number;
};

export type ClinicalEvent = {
  id: string;
  memberId: string;
  episodeId: string;
  type: 'triage' | 'recommendation' | 'escalation' | 'followup' | 'outcome';
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'emergency';
  redFlags: string[];
  recommendation: string;
  followUpDueAt?: Date;
  createdAt: Date;
  protocolRef?: string;
};

export type ClinicalEpisode = {
  id: string;
  memberId: string;
  sessionId: string;
  chiefComplaint: string;
  facts: ExtractedClinicalFact[];
  event: ClinicalEvent;
  handoffId?: string;
  previousEpisodeId?: string;
  status: 'open' | 'resolved' | 'escalated';
  createdAt: Date;
  resolvedAt?: Date;
};

export type MemberClinicalProfile = {
  memberId: string;
  snapshot: HealthInfo;
  activeConditions: Array<{
    name: string;
    onsetDate?: Date;
    severity: 'mild' | 'moderate' | 'severe';
    status: 'active' | 'resolved';
    notes: string;
  }>;
  medicationHistory: Array<{
    name: string;
    startDate: Date;
    endDate?: Date;
    reason: string;
    outcome?: string;
  }>;
  timeline: ClinicalEvent[];
};
