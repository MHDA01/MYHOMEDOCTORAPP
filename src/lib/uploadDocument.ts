import { User } from 'firebase/auth';
import { doc, collection, setDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from './firebase';
import type { MedicalDocument } from './types';

interface UploadDocumentData extends Omit<MedicalDocument, 'id'> {
  file: File;
}

export const uploadDocument = async (user: User, docData: UploadDocumentData) => {
  if (!user || !docData.file) throw new Error("Usuario no autenticado o archivo no proporcionado.");
  
  try {
    // 1. Crear referencia en Firestore
    const docRef = doc(collection(db, 'users', user.uid, 'documents'));
    
    // 2. Subir archivo a Storage
    const fileName = `${Date.now()}-${docData.file.name}`;
    const storageRef = ref(storage, `users/${user.uid}/documents/${fileName}`);
    const snapshot = await uploadBytes(storageRef, docData.file);
    const url = await getDownloadURL(snapshot.ref);
    
    // 3. Guardar documento en Firestore
    await setDoc(docRef, {
      name: docData.name,
      category: docData.category,
      uploadedAt: Timestamp.now(),
      studyDate: docData.studyDate ? Timestamp.fromDate(docData.studyDate) : Timestamp.now(),
      url,
      userId: user.uid
    });

    return { url, docId: docRef.id };
  } catch (error) {
    console.error("Error al subir documento:", error);
    throw new Error("No se pudo subir el documento. Por favor, inténtalo de nuevo.");
  }
}
