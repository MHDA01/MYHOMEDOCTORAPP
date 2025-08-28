export type MedicalDocument = {
  id: string;
  name: string;
  category: 'Lab Result' | 'Imaging Report' | 'Prescription' | 'Other';
  studyDate: Date;
  uploadedAt: Date;
  url?: string;
};

import { Timestamp } from 'firebase/firestore';

export type Appointment = {
  id: string;
  doctor: string;
  specialty: string;
  date: Date;
  status: 'Upcoming' | 'Past';
  reminder?: string;
  notified?: boolean;
  uploadedAt: Date;
};

export type Medication = {
  id: string; // Document ID in Firestore
  name: string; // Medication name
  dosage: string; // Dosage information (e.g., "500mg", "2 tablets")
  frequency: number; // How often to take the medication in hours (e.g., 24 for once a day)
  administrationPeriod?: string; // Optional: Duration of administration (e.g., "7 days", "Permanent")
  time?: Array<Timestamp | null>; // Optional: Specific times to take the medication
  active: boolean; // Is the medication currently active?
  startTime: Timestamp | null; // Start time of the medication regimen
  endTime: Timestamp | null; // End time of the medication regimen
  uploadedAt: Timestamp; // When the medication record was uploaded
};

export type EmergencyContact = {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export type HealthInfo = {
  allergies: string[];
  medications: string[];
  pathologicalHistory: string;
  surgicalHistory: string;
  gynecologicalHistory: string;
  emergencyContacts: EmergencyContact[];
};

export type PersonalInfo = {
  firstName: string;
  lastName: string;
  sex: 'male' | 'female' | 'other';
  dateOfBirth: Date;
  country: 'chile' | 'argentina' | 'colombia';
  insuranceProvider: string;
  insuranceProviderName?: string;
}
