
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
  notified?: boolean;
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

// Campos almacenados en Cuentas_Tutor/{uid}/Integrantes/{profileId}
// Solo datos de tarjeta — documentos ligeros descargados por onSnapshot
export type FamilyProfile = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  sex: 'male' | 'female' | 'other';
  dateOfBirth: string;
  age?: number;
  weight?: number;
  country?: 'chile' | 'argentina' | 'colombia';
  insuranceProvider?: string;
  insuranceProviderName?: string;
  relationship: string;
  esTitular?: boolean;
  // Resumen médico (arrays cortos, útiles en tarjeta)
  allergies?: string[];
  medications?: string[];
  // Flag ligero — el historial clínico largo vive en la subcolección historial/registro
  hasHistory?: boolean;
  createdAt?: any;
  updatedAt?: any;
};

// Campos almacenados en Cuentas_Tutor/{uid}/Integrantes/{profileId}/historial/registro
// Cargados únicamente bajo demanda al abrir el panel de edición
export type FamilyProfileMedical = {
  pathologicalHistory?: string;
  surgicalHistory?: string;
  gynecologicalHistory?: string;
  updatedAt?: any;
};
