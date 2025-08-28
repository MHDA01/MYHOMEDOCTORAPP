import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { getFirestore, collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc as docRef } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';
import { UserContext } from '@/context/user-context';

export type MedicalDocument = {
  id: string;
  name: string;
  category: 'Lab Result' | 'Imaging Report' | 'Prescription' | 'Other';
  studyDate: Date;
  uploadedAt: Date;
  url?: string;
};

type MedicalDocumentsContextType = {
  documents: MedicalDocument[];
  addDocument: (doc: { name: string; category: MedicalDocument['category']; studyDate: Date; file: File }) => Promise<void>;
  updateDocument: (id: string, data: Partial<Omit<MedicalDocument, 'id' | 'url'>>) => Promise<void>;
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
    if (!user) return;
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
          };
        })
      );
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  const addDocument = async ({ name, category, studyDate, file }: { name: string; category: MedicalDocument['category']; studyDate: Date; file: File }) => {
    if (!user) throw new Error('No user');
    const documentId = uuidv4();
    const storageRef = ref(getStorage(), `medical-documents/${user.uid}/${documentId}/${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    await addDoc(collection(getFirestore(), 'medicalDocuments', user.uid, 'items'), {
      name,
      category,
      studyDate,
      uploadedAt: new Date(),
      url,
    });
  };

  const updateDocument = async (id: string, data: Partial<Omit<MedicalDocument, 'id' | 'url'>>) => {
    if (!user) throw new Error('No user');
    await updateDoc(docRef(getFirestore(), 'medicalDocuments', user.uid, 'items', id), data);
  };

  const deleteDocument = async (id: string) => {
    if (!user) throw new Error('No user');
    await deleteDoc(docRef(getFirestore(), 'medicalDocuments', user.uid, 'items', id));
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
