
'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication, Summary } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { processMedicalDocument, ProcessedDocumentOutput } from '@/ai/flows/process-document-flow';

type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

type SerializableAppointment = Omit<Appointment, 'date'> & {
    date: Timestamp;
};

type SerializableDocument = Omit<DocumentType, 'uploadedAt' | 'studyDate'> & {
    uploadedAt: Timestamp;
    studyDate?: Timestamp;
};

type UserDocumentData = {
    personalInfo: SerializablePersonalInfo,
    healthInfo: HealthInfo
}

type UserDocument = {
    personalInfo: PersonalInfo;
    healthInfo: HealthInfo;
}

async function getCollection<T>(userId: string, collectionName: string, orderByField: string, orderDirection: 'asc' | 'desc' = 'desc'): Promise<T[]> {
    const q = query(collection(db, 'users', userId, collectionName), orderBy(orderByField, orderDirection));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
}

async function getUserDocument(userId: string): Promise<UserDocument | null> {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
        const data = docSnap.data() as UserDocumentData;
        if (data && data.personalInfo && data.personalInfo.dateOfBirth) {
             return {
                personalInfo: {
                    ...data.personalInfo,
                    dateOfBirth: data.personalInfo.dateOfBirth.toDate(),
                },
                healthInfo: data.healthInfo,
            };
        }
    }
    return null; 
}

async function updateUserDocument(userId: string, data: Partial<UserDocument>): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId);
    const serializableData: Partial<any> = { ...data };
    if (data.personalInfo && data.personalInfo.dateOfBirth) {
        const dob = data.personalInfo.dateOfBirth;
        serializableData.personalInfo = {
            ...data.personalInfo,
            dateOfBirth: dob instanceof Timestamp ? dob : Timestamp.fromDate(dob),
        }
    }
    await setDoc(docRef, serializableData, { merge: true });
  } catch (error) {
    console.error('Error updating user document:', error);
    throw new Error('Could not update user document.');
  }
}

interface UserContextType {
  personalInfo: PersonalInfo | null;
  healthInfo: HealthInfo | null;
  appointments: Appointment[];
  documents: DocumentType[];
  medications: Medication[];
  updatePersonalInfo: (info: PersonalInfo) => Promise<void>;
  updateHealthInfo: (info: HealthInfo) => Promise<void>;
  addAppointment: (appointment: Omit<Appointment, 'id' | 'notified'>) => Promise<void>;
  updateAppointment: (id: string, appointment: Partial<Omit<Appointment, 'id'>>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  addDocument: (doc: Omit<DocumentType, 'id'>) => Promise<void>;
  updateDocument: (id: string, doc: Partial<DocumentType>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  updateMedication: (id: string, med: Partial<Medication>) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  loading: boolean;
  user: User | null;
  signOutUser: () => Promise<void>;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

const initialAnonymousPersonalInfo: PersonalInfo = {
  firstName: 'Invitado',
  lastName: '',
  sex: 'other',
  dateOfBirth: new Date(),
  country: 'chile',
  insuranceProvider: 'Fonasa',
};

const initialAnonymousHealthInfo: HealthInfo = {
    allergies: [],
    medications: [],
    pathologicalHistory: '',
    surgicalHistory: '',
    gynecologicalHistory: '',
    emergencyContacts: [],
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);
  
  const { toast } = useToast();
  
  const loadUserData = useCallback(async (currentUser: User) => {
    setLoading(true);
    try {
        const userDoc = await getUserDocument(currentUser.uid);
        
        if (userDoc) {
            setPersonalInfo(userDoc.personalInfo);
            setHealthInfo(userDoc.healthInfo);
        } else {
            const isAnon = currentUser.isAnonymous;
            const defaultPersonalInfo: PersonalInfo = isAnon ? initialAnonymousPersonalInfo : {
                firstName: currentUser.displayName?.split(' ')[0] || 'Nuevo',
                lastName: currentUser.displayName?.split(' ').slice(1).join(' ') || 'Usuario',
                sex: 'other',
                dateOfBirth: new Date(),
                country: 'chile',
                insuranceProvider: 'Fonasa',
                insuranceProviderName: ''
            };
            const defaultHealthInfo = isAnon ? initialAnonymousHealthInfo : {
                allergies: [], medications: [], pathologicalHistory: '', surgicalHistory: '',
                gynecologicalHistory: '', emergencyContacts: [],
            };
            
            await updateUserDocument(currentUser.uid, { personalInfo: defaultPersonalInfo, healthInfo: defaultHealthInfo });
            setPersonalInfo(defaultPersonalInfo);
            setHealthInfo(defaultHealthInfo);
        }
        
        const [appointmentsData, documentsData, medicationsData] = await Promise.all([
            getCollection<SerializableAppointment>(currentUser.uid, 'appointments', 'date'),
            getCollection<SerializableDocument>(currentUser.uid, 'documents', 'uploadedAt'),
            getCollection<Medication>(currentUser.uid, 'name', 'asc'),
        ]);

        setAppointments(appointmentsData.map(a => ({...a, date: a.date.toDate() })));
        setDocuments(documentsData.map(d => ({...d, uploadedAt: d.uploadedAt.toDate(), studyDate: d.studyDate?.toDate() } as DocumentType)));
        setMedications(medicationsData);

    } catch (error) {
       console.error("Failed to manage user profile:", error);
       toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos del perfil.'});
    } finally {
       setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await loadUserData(currentUser);
      } else {
        setUser(null); setPersonalInfo(null); setHealthInfo(null);
        setAppointments([]); setDocuments([]); setMedications([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, [loadUserData]);
  
  const signOutUser = async () => {
    try { await signOut(auth); } 
    catch (error) { console.error("Error signing out:", error); }
  };

  const updatePersonalInfo = async (info: PersonalInfo) => {
    if (user) {
      setPersonalInfo(info);
      if(auth.currentUser && auth.currentUser.displayName !== `${info.firstName} ${info.lastName}`) {
          await updateProfile(auth.currentUser, { displayName: `${info.firstName} ${info.lastName}` });
      }
      await updateUserDocument(user.uid, { personalInfo: info });
    }
  };

  const updateHealthInfo = async (info: HealthInfo) => {
      if (user) {
          setHealthInfo(info);
          await updateUserDocument(user.uid, { healthInfo: info });
      }
  };

  const addAppointment = async (appointment: Omit<Appointment, 'id' | 'notified'>) => {
      if (!user) return;
      const newDocRef = doc(collection(db, 'users', user.uid, 'appointments'));
      const newAppointment = { ...appointment, id: newDocRef.id, notified: false };
      await setDoc(newDocRef, { ...appointment, date: Timestamp.fromDate(appointment.date), notified: false });
      setAppointments(prev => [...prev, newAppointment].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const updateAppointment = async (id: string, appointment: Partial<Omit<Appointment, 'id'>>) => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid, 'appointments', id);
      const dataToUpdate = { ...appointment, notified: false };
      const data = dataToUpdate.date ? { ...dataToUpdate, date: Timestamp.fromDate(new Date(dataToUpdate.date)) } : dataToUpdate;
      await updateDoc(docRef, data);
      const updatedData = { ...appointments.find(a => a.id === id), ...dataToUpdate } as Appointment;
      setAppointments(prev => prev.map(a => a.id === id ? updatedData : a).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  };

  const deleteAppointment = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'appointments', id));
      setAppointments(prev => prev.filter(a => a.id !== id));
  };

  const addDocument = async (docData: Omit<DocumentType, 'id'>) => {
    if (!user) return;
    toast({ title: "Procesando documento...", description: "La IA está analizando el archivo. Esto puede tardar un momento." });

    let processedData: ProcessedDocumentOutput | null = null;
    if (docData.consent) {
        try {
            processedData = await processMedicalDocument({ documentDataUris: docData.urls });
            toast({ title: "¡Resumen de IA generado!", description: "El resumen del documento se ha guardado." });
        } catch (error) {
            console.error("Error processing document with AI:", error);
            toast({ variant: 'destructive', title: "Error de IA", description: "No se pudo generar el resumen del documento." });
        }
    }

    const newDocRef = doc(collection(db, 'users', user.uid, 'documents'));
    const newDocument: DocumentType = {
        ...docData,
        id: newDocRef.id,
        aiSummary: processedData?.summary,
        transcription: processedData?.transcription,
    };

    const dataToSave = { 
        name: newDocument.name, category: newDocument.category,
        urls: newDocument.urls, consent: newDocument.consent,
        uploadedAt: Timestamp.fromDate(newDocument.uploadedAt),
        studyDate: newDocument.studyDate ? Timestamp.fromDate(newDocument.studyDate) : Timestamp.fromDate(newDocument.uploadedAt),
        aiSummary: newDocument.aiSummary,
        transcription: newDocument.transcription,
    };
    
    await setDoc(newDocRef, dataToSave);
    setDocuments(prev => [newDocument, ...prev].sort((a, b) => (b.studyDate || b.uploadedAt).getTime() - (a.studyDate || a.uploadedAt).getTime()));
  };

  const updateDocument = async (id: string, docData: Partial<DocumentType>) => {
      if (!user) return;
      const dataToUpdate: Partial<SerializableDocument> & { [key: string]: any } = { ...docData };
      if (docData.studyDate) dataToUpdate.studyDate = Timestamp.fromDate(docData.studyDate);
      await updateDoc(doc(db, 'users', user.uid, 'documents', id), dataToUpdate);
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...docData } : d));
  };

  const deleteDocument = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'documents', id));
      setDocuments(prev => prev.filter(d => d.id !== id));
  };

  const addMedication = async (med: Omit<Medication, 'id'>) => {
      if (!user) return;
      const newDocRef = doc(collection(db, 'users', user.uid, 'medications'));
      const newMed = { ...med, id: newDocRef.id };
      await setDoc(newDocRef, newMed);
      setMedications(prev => [...prev, newMed].sort((a, b) => a.name.localeCompare(b.name)));
  };

  const updateMedication = async (id: string, med: Partial<Medication>) => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid, 'medications', id);
      await updateDoc(docRef, med);
      const fullMed = { ...medications.find(m => m.id === id), ...med } as Medication;
      setMedications(prev => prev.map(m => m.id === id ? fullMed : m).sort((a, b) => a.name.localeCompare(b.name)));
  };
  
  const deleteMedication = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'medications', id));
      setMedications(prev => prev.filter(m => m.id !== id));
  };


  return (
    <UserContext.Provider value={{
        user, loading, personalInfo, healthInfo, appointments, documents, medications,
        signOutUser, updatePersonalInfo, updateHealthInfo, addAppointment, updateAppointment,
        deleteAppointment, addDocument, updateDocument, deleteDocument, addMedication,
        updateMedication, deleteMedication,
    }}>
      {children}
    </UserContext.Provider>
  );
};
