"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getFirestore, collection, query, onSnapshot, updateDoc, deleteDoc, doc as docRef, getDoc, setDoc } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { UserContext } from '@/context/user-context';

export type MedicalDocument = {
  id: string;
  name: string;
  category: 'Lab Result' | 'Imaging Report' | 'Prescription' | 'Other';
  studyDate: Date;
  uploadedAt: Date;
  url?: string;
  storagePath?: string;
};

type MedicalDocumentsContextType = {
  documents: MedicalDocument[];
  addDocument: (doc: { name: string; category: MedicalDocument['category']; studyDate: Date; file: File }) => Promise<void>;
  updateDocument: (id: string, data: Partial<Omit<MedicalDocument, 'id' | 'url' | 'storagePath'>>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  loading: boolean;
  user: any;
};

export const MedicalDocumentsContext = createContext<MedicalDocumentsContextType | undefined>(undefined);

export function MedicalDocumentsProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext) ?? {};
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const q = query(collection(getFirestore(), 'medicalDocuments', user.uid, 'items'));
    const unsub = onSnapshot(q, (snap) => {
      setDocuments(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: data.name || '',
            category: data.category || 'Other',
            studyDate: data.studyDate?.toDate ? data.studyDate.toDate() : new Date(),
            uploadedAt: data.uploadedAt?.toDate ? data.uploadedAt.toDate() : new Date(),
            url: data.url || undefined,
            storagePath: data.storagePath || undefined,
          };
        })
      );
      setLoading(false);
    }, (error) => {
        console.error("Error fetching documents:", error);
        toast({ variant: "destructive", title: "Error al cargar documentos" });
        setLoading(false);
    });
    return () => unsub();
  }, [user, toast]);

  const addDocument = async ({ name, category, studyDate, file }: { name: string; category: MedicalDocument['category']; studyDate: Date; file: File }) => {
    if (!user) throw new Error('No user authenticated');
    
    const newDocRef = docRef(collection(getFirestore(), 'medicalDocuments', user.uid, 'items'));
    const documentId = newDocRef.id;

    const storagePath = `medical-documents/${user.uid}/${documentId}/${file.name}`;
    const storageRef = ref(getStorage(), storagePath);
    
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    await setDoc(newDocRef, {
      name,
      category,
      studyDate,
      uploadedAt: new Date(),
      url,
      storagePath: storagePath 
    });
  };

  const updateDocument = async (id: string, data: Partial<Omit<MedicalDocument, 'id' | 'url' | 'storagePath'>>) => {
    if (!user) throw new Error('No user authenticated');
    await updateDoc(docRef(getFirestore(), 'medicalDocuments', user.uid, 'items', id), data);
  };

  const deleteDocument = async (id: string) => {
    if (!user) throw new Error('No user authenticated');
    const docToDeleteRef = docRef(getFirestore(), 'medicalDocuments', user.uid, 'items', id);
    
    try {
      const docSnap = await getDoc(docToDeleteRef);
      if (docSnap.exists()) {
        const docData = docSnap.data();
        
        if (docData.storagePath) {
          const storage = getStorage();
          const fileRef = ref(storage, docData.storagePath);
          await deleteObject(fileRef);
        } else if (docData.url) { 
          const storage = getStorage();
          const fileRef = ref(storage, docData.url);
          await deleteObject(fileRef).catch((err) => {
            console.warn("Could not delete file from URL, maybe it's an old format:", err);
          });
        }
      }
      
      await deleteDoc(docToDeleteRef);

    } catch (error) {
      console.error("Error deleting document and file: ", error);
      toast({
        variant: "destructive",
        title: "Error al eliminar",
        description: "No se pudo eliminar el documento y su archivo asociado.",
      });
      throw error;
    }
  };

  return (
    <MedicalDocumentsContext.Provider value={{ documents, addDocument, updateDocument, deleteDocument, loading, user }}>
      {children}
    </MedicalDocumentsContext.Provider>
  );
}

export function useMedicalDocuments() {
  const ctx = useContext(MedicalDocumentsContext);
  if (!ctx) throw new Error('useMedicalDocuments must be used within a MedicalDocumentsProvider');
  return ctx;
}