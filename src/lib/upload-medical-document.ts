/**
 * uploadMedicalDocumentEphemeral
 * ---------------------------------
 * Sube un archivo médico a Firebase Storage en la ruta temporal:
 *   temp_ocr_uploads/{tutorId}/{patientId}/{filename}
 *
 * Agrega metadatos personalizados que usa la Cloud Function de IDP:
 *   - toBeProcessed: 'true'  → gatillo para que la CF inicie el procesamiento
 *   - tutorId / patientId    → referencias Firestore para actualizar el doc
 *   - category               → tipo de documento para afinar el modelo de extracción
 *   - firestoreDocId         → ID del doc en Firestore que se actualizará con idpStatus
 *
 * Flujo IDP previsto:
 *   1. Cliente sube archivo aquí con toBeProcessed='true'
 *   2. CF onObjectFinalized detecta el archivo por el metadato
 *   3. CF actualiza idpStatus → 'processing' en Firestore
 *   4. CF llama a Gemini Vision / Document AI
 *   5. CF escribe idpExtracted + idpStatus='done' en Firestore
 *   6. CF mueve el archivo a medical_documents/{tutorId}/... (ruta permanente)
 *   7. CF elimina el archivo temporal de temp_ocr_uploads
 */

import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import type { UploadTaskSnapshot } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import type { DocumentCategory } from '@/lib/types';

/** Ruta raíz de la zona temporal de OCR/IDP */
const TEMP_OCR_ROOT = 'temp_ocr_uploads';

export interface UploadMedicalDocumentOptions {
  /** ID del Tutor (Cuentas_Tutor/{tutorId}) */
  tutorId: string;
  /** ID del Integrante / paciente (Integrantes/{patientId}) */
  patientId: string;
  /** Archivo o Blob a subir (imagen PNG/JPEG/PDF) */
  file: File | Blob;
  /**
   * Categoría del documento médico.
   * Se pasa como metadato a la CF para afinar la extracción IDP.
   */
  category?: DocumentCategory;
  /**
   * ID del documento en Firestore.
   * La CF de IDP lo usará para actualizar idpStatus e idpExtracted
   * directamente en el documento correcto sin tener que buscarlo.
   */
  firestoreDocId?: string;
  /**
   * Nombre de archivo en Storage.
   * Por defecto: timestamp ISO + extensión inferida del tipo MIME.
   */
  fileName?: string;
  /** Callback opcional con el % de progreso (0..100) */
  onProgress?: (percent: number) => void;
}

export interface UploadMedicalDocumentResult {
  /** URL pública de descarga del archivo subido */
  downloadURL: string;
  /** Ruta completa en Firebase Storage (para referencias y borrado futuro) */
  storagePath: string;
}

/** Infiere una extensión de archivo a partir del MIME type */
function extensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png':      '.png',
    'image/jpeg':     '.jpg',
    'image/jpg':      '.jpg',
    'image/webp':     '.webp',
    'application/pdf':'.pdf',
  };
  return map[mimeType] ?? '.bin';
}

/**
 * Sube un documento médico de forma efímera a la zona temporal de OCR/IDP.
 *
 * @returns Promesa con la URL de descarga y la ruta completa en Storage.
 */
export async function uploadMedicalDocumentEphemeral(
  options: UploadMedicalDocumentOptions
): Promise<UploadMedicalDocumentResult> {
  const { tutorId, patientId, file, category, firestoreDocId, fileName, onProgress } = options;

  const mimeType = file instanceof File ? file.type : (file as Blob).type;
  const resolvedName =
    fileName ??
    `doc_${new Date().toISOString().replace(/[:.]/g, '-')}${extensionFromMime(mimeType)}`;

  // Ruta: temp_ocr_uploads/{tutorId}/{patientId}/{resolvedName}
  const storagePath = `${TEMP_OCR_ROOT}/${tutorId}/${patientId}/${resolvedName}`;
  const storageRef   = ref(storage, storagePath);

  // Metadatos que la Cloud Function de IDP leerá para procesar el archivo
  const customMetadata: Record<string, string> = {
    toBeProcessed: 'true',    // ← gatillo principal para la CF
    tutorId,
    patientId,
  };
  if (category)       customMetadata.category       = category;
  if (firestoreDocId) customMetadata.firestoreDocId = firestoreDocId;

  const metadata = {
    contentType: mimeType || 'image/png',
    customMetadata,
  };

  return new Promise<UploadMedicalDocumentResult>((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, metadata);

    task.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        if (onProgress) {
          const percent = Math.round(
            (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          );
          onProgress(percent);
        }
      },
      (error) => {
        console.error('[uploadMedicalDocumentEphemeral] Error al subir:', error);
        reject(error);
      },
      async () => {
        try {
          const downloadURL = await getDownloadURL(task.snapshot.ref);
          resolve({ downloadURL, storagePath });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}
