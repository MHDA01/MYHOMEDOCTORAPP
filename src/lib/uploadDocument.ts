// Función simplificada para subir documentos
const addDocument = async (docData: Omit<DocumentType, 'id'>) => {
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
  } catch (error) {
    console.error("Error al subir documento:", error);
    throw new Error("No se pudo subir el documento. Por favor, inténtalo de nuevo.");
  }
}
