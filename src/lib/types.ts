
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
  episodeId?: string;
  outcomeNotes?: string;
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
  isEncrypted?: boolean;
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

// ──────────────────────────────────────────────────────────────
// TOKEN & PAYMENT SYSTEM
// ──────────────────────────────────────────────────────────────

/**
 * Sistema de tokens para consultas de teleorientación.
 * Almacenado en Cuentas_Tutor/{uid}/tokens
 *
 * Flujo:
 * 1. Registración → free: 6 tokens (2/día × 3 días)
 * 2. Cloud Function renueva 2 tokens diarios (primeros 3 días)
 * 3. Después de 3 días → 0 tokens → Modal de pago Wompy
 * 4. Pago exitoso → paid: 210 tokens (7 consultas/día × 30 días)
 */
export interface TokenSystem {
  /** Tokens gratis disponibles (renovables diariamente durante 3 días) */
  free: number;
  /** Tokens pagos disponibles (210 = 7 consultas/día × 30 días) */
  paid: number;
  /** Timestamp de última renovación de tokens gratis */
  dailyReset: Date;
  /** Timestamp de expiración del período de prueba (3 días desde registro) */
  freePeriodEnds: Date;
  /** Timestamp de expiración del plan pagado (30 días desde compra) */
  planExpires?: Date;
  /** Renovación automática mensual activa */
  autoRenew?: boolean;
  /** Estado de la suscripción de renovación automática */
  subscriptionStatus?: 'none' | 'active' | 'pending' | 'cancelled' | 'payment_failed';
  /** Próxima fecha de cobro automático */
  nextBillingDate?: Date;
  /** Referencia opaca de Wompi a la tarjeta tokenizada (nunca el número real) */
  paymentSourceId?: string | number;
  /** Timestamp de aceptación de términos y autorización de datos personales (Wompi) */
  consentAcceptedAt?: Date;
  /** Intentos de cobro fallidos consecutivos (se auto-cancela tras 3) */
  failedChargeAttempts?: number;
}

/**
 * Transacción de pago a través de Wompi.
 * Almacenado en Cuentas_Tutor/{uid}/transactions (subcol)
 */
export interface Transaction {
  id: string;
  /** ID de transacción en Wompi */
  wompy_id?: string;
  /** Monto en COP */
  amount: number;
  /** Estado: pending, success, failed, cancelled */
  status: 'pending' | 'success' | 'failed' | 'cancelled';
  /** Tipo: purchase (pago único), recurring (renovación automática), refund */
  type: 'purchase' | 'recurring' | 'refund';
  /** Referencia: "teleorientacion_monthly_{uid}_{timestamp}" o "teleorientacion_recurring_{uid}_{timestamp}" */
  reference: string;
  /** URL de pago de Wompi (para el usuario, solo pagos únicos) */
  payment_url?: string;
  /** Fecha de transacción */
  createdAt: Date;
  /** Fecha de completación */
  completedAt?: Date;
  /** Descripción para el usuario */
  description: string;
}

/**
 * Estado de una consulta de teleorientación.
 * Almacenado en Cuentas_Tutor/{uid}/conversaciones/{convId}
 * 
 * Flujo:
 * - in-progress: Chat abierto, usuario consultando
 * - completed: Avatar confirmó resolución, usuario respondió "Sí" → 1 token consumido
 */
export type ConsultationStatus = 'in-progress' | 'completed' | 'abandoned';

export interface Consultation {
  id: string;
  /** Estado de la consulta */
  status: ConsultationStatus;
  /** ¿Ya se consumió el token? */
  tokenConsumed: boolean;
  /** Fecha de inicio */
  createdAt: Date;
  /** Fecha de completación (solo si status=completed) */
  completedAt?: Date;
}
