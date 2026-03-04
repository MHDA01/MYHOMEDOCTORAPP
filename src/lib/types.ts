
/** Categorías de documentos médicos */
export type DocumentCategory = 'Lab Result' | 'Prescription' | 'Imaging Report' | 'Other';

/**
 * Estado del procesamiento IDP (Intelligent Document Processing).
 * - pending:    archivo subido a temp_ocr_uploads, esperando a ser procesado.
 * - processing: Cloud Function detectó el archivo y lo está analizando.
 * - done:       extracción completada; los campos idpExtracted están disponibles.
 * - error:      el procesamiento falló; idpError contiene el detalle.
 */
export type IdpStatus = 'pending' | 'processing' | 'done' | 'error';

/**
 * Resultado estructurado extraído por la Cloud Function IDP (Gemini 1.5 Flash).
 * El schema coincide con el prompt inyectado al modelo.
 */
export interface IdpExtracted {
  /** Nombre del estudio o tipo de documento (ej: "Hemograma completo") */
  estudio?: string;
  /** Parámetros individuales extraídos del documento */
  resultados?: Array<{
    parametro:     string;
    valor:         string;
    referencia?:   string;
    interpretacion?: 'Normal' | 'Alta' | 'Baja' | string;
  }>;
  /** Conclusión o diagnóstico general del informe */
  conclusion_general?: string;
}

export type Document = {
  id: string;
  name: string;
  category: DocumentCategory;
  uploadedAt: Date;
  /** URL pública de descarga en Firebase Storage */
  url: string;
  /**
   * Ruta completa en Firebase Storage.
   * Necesaria para que la Cloud Function pueda eliminar el archivo
   * temporal (temp_ocr_uploads) tras procesar y moverlo a medical_documents.
   */
  storagePath?: string;
  /** Estado del pipeline IDP. Undefined = documento antiguo sin procesamiento. */
  idpStatus?: IdpStatus;
  /** Datos estructurados extraídos por la Cloud Function de IDP */
  idpExtracted?: IdpExtracted;
  /** Mensaje de error si idpStatus === 'error' */
  idpError?: string;
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
  /**
   * Lista de texto para el resumen de "medicamentos frecuentes" del historial
   * (ej: ["Losartán 50mg", "Aspirina"]).
   * Es distinta de la subcolección `medications` (tipo Medication[]) que
   * gestiona RecordatoriosMedicamentos con horario y estado activo/inactivo.
   */
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
