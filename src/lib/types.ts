export type Document = {
  id: string;
  name: string;
  category: 'Lab Result' | 'Prescription' | 'Imaging Report' | 'Other';
  uploadedAt: Date;
  url: string;
};

export type Appointment = {
  id: string;
  doctor: string;
  specialty: string;
  date: Date;
  status: 'Upcoming' | 'Past';
  reminder?: string;
};

export type Medication = {
  id: string;
  name: string;
  dosage: string;
  frequency: number; // Interval in hours, e.g., 24 for daily, 12 for twice a day
  administrationPeriod: string; // e.g., '7 days', 'Permanent'
  time: string[];
  active: boolean;
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
  emergencyContacts: EmergencyContact[];
};
