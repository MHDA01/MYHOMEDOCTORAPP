"use client";
import { useState, useEffect } from "react";
import { getStorage, ref, uploadBytesResumable } from "firebase/storage";
import { getFirestore, collection, query, onSnapshot, updateDoc, doc as docRef } from "firebase/firestore";
import { v4 as uuidv4 } from "uuid";
import { useContext } from "react";
import { UserContext } from "../../context/user-context";

export function MedicalDocuments() {
  const { user } = useContext(UserContext) ?? {};
  const [progress, setProgress] = useState(0);
  const [docs, setDocs] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);

  // Subida de archivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const documentId = uuidv4();
    const storageRef = ref(getStorage(), `medical-documents/${user.uid}/${documentId}/${file.name}`);
    const uploadTask = uploadBytesResumable(storageRef, file);

    uploadTask.on("state_changed",
      (snapshot) => setProgress((snapshot.bytesTransferred / snapshot.totalBytes) * 100),
      (error) => alert("Error al subir: " + error),
      () => alert("¡Documento subido! Se procesará automáticamente.")
    );
  };

  // Listado de documentos
  useEffect(() => {
    if (!user) return;
    const q = query(collection(getFirestore(), "medicalDocuments", user.uid, "items"));
    return onSnapshot(q, (snap) => setDocs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user]);

  // Edición de observaciones
  const handleObservationChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!selected || !user) return;
    const newObs = e.target.value;
    setSelected({ ...selected, doctorObservations: newObs });
    await updateDoc(docRef(getFirestore(), "medicalDocuments", user.uid, "items", selected.id), {
      doctorObservations: newObs,
    });
  };

  if (!user) return null;

  return (
    <div>
      <h2>Mis Documentos Médicos</h2>
      <input type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFileChange} />
      <progress value={progress} max={100} />
      <ul>
        {docs.map(doc => (
          <li key={doc.id} onClick={() => setSelected(doc)} style={{cursor:'pointer',margin:'8px 0',fontWeight:selected?.id===doc.id?'bold':'normal'}}>
            {doc.fileName} ({doc.documentType})
          </li>
        ))}
      </ul>
      {selected && (
        <div style={{border:'1px solid #ccc',padding:16,marginTop:16}}>
          <h3>Resumen</h3>
          <p>{selected.extractedData.summary}</p>
          <label>Fecha del estudio:</label>
          <input type="date" value={selected.studyDate ? selected.studyDate.split('T')[0] : ""} readOnly />
          <br/>
          <label>Observaciones del médico:</label>
          <textarea value={selected.doctorObservations} onChange={handleObservationChange} />
          <br/>
          <a href={`https://firebasestorage.googleapis.com/v0/b/{YOUR_BUCKET}/o/${encodeURIComponent(selected.storagePath)}?alt=media`} target="_blank" rel="noopener noreferrer">Ver archivo original</a>
        </div>
      )}
    </div>
  );
}