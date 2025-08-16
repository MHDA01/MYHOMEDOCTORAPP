
'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

type SerializableAppointment = Omit<Appointment, 'date'> & {
    date: Timestamp;
};

type SerializableDocument = Omit<DocumentType, 'uploadedAt' | 'studyDate' | 'files'> & {
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
  updateDocument: (id: string, doc: Partial<Omit<DocumentType, 'id' | 'files'>>) => Promise<void>;
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

const fileToDataUri = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
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
        
        const appointmentsData = await getCollection<SerializableAppointment>(currentUser.uid, 'appointments', 'date');
        const medicationsData = await getCollection<Medication>(currentUser.uid, 'medications', 'name', 'asc');

        setAppointments(appointmentsData.map(a => ({...a, date: a.date.toDate() })));
        setMedications(medicationsData);

    } catch (error) {
       console.error("Failed to manage user profile:", error);
       toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos del perfil.'});
    } finally {
       setLoading(false);
    }
  }, [toast]);
  
  async function getCollection<T>(userId: string, collectionName: string, orderByField: string, orderDirection: 'asc' | 'desc' = 'desc'): Promise<T[]> {
      const q = query(collection(db, 'users', userId, collectionName), orderBy(orderByField, orderDirection));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
  }


  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        await loadUserData(currentUser);
      } else {
        setUser(null); setPersonalInfo(null); setHealthInfo(null);
        setAppointments([]); setDocuments([]); setMedications([]);
        setLoading(false);
      }
    });

    let unsubscribeDocuments: () => void = () => {};
    if (user) {
        const q = query(collection(db, 'users', user.uid, 'documents'), orderBy('uploadedAt', 'desc'));
        unsubscribeDocuments = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(doc => {
                const data = doc.data() as SerializableDocument;
                return {
                    ...data,
                    id: doc.id,
                    uploadedAt: data.uploadedAt.toDate(),
                    studyDate: data.studyDate?.toDate()
                } as DocumentType;
            });
            setDocuments(docs);
        }, (error) => {
            console.error("Error listening to documents collection: ", error);
        });
    }

    return () => {
        unsubscribeAuth();
        unsubscribeDocuments();
    };
  }, [loadUserData, user]);
  
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
      const docRef = await addDoc(collection(db, 'users', user.uid, 'appointments'), { ...appointment, date: Timestamp.fromDate(appointment.date), notified: false });
      const newAppointment = { ...appointment, id: docRef.id, date: appointment.date, notified: false };
      setAppointments(prev => [...prev, newAppointment].sort((a,b) => b.date.getTime() - a.date.getTime()));
  };
  
  const updateAppointment = async (id: string, appointment: Partial<Omit<Appointment, 'id'>>) => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid, 'appointments', id);
      const dataToUpdate: any = { ...appointment, notified: false };
      if (appointment.date) {
        dataToUpdate.date = Timestamp.fromDate(new Date(appointment.date));
      }
      await updateDoc(docRef, dataToUpdate);
      setAppointments(prev => prev.map(app => app.id === id ? { ...app, ...appointment } : app).sort((a,b) => b.date.getTime() - a.date.getTime()));
  };
  
  const deleteAppointment = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'appointments', id));
      setAppointments(prev => prev.filter(app => app.id !== id));
  };
  

  const addDocument = async (docData: Omit<DocumentType, 'id'>) => {
    if (!user) return;

    const dataUris = await Promise.all((docData.files || []).map(fileToDataUri));

    const dataToSave: any = { 
        name: docData.name,
        category: docData.category,
        urls: dataUris,
        uploadedAt: Timestamp.fromDate(docData.uploadedAt),
        studyDate: docData.studyDate ? Timestamp.fromDate(docData.studyDate) : Timestamp.fromDate(docData.uploadedAt),
        processingStatus: 'pending',
    };
    
    await addDoc(collection(db, 'users', user.uid, 'documents'), dataToSave);

    toast({ title: "Documento subido", description: "Se está procesando para extraer los datos. Esto puede tardar unos minutos." });
  };

  const updateDocument = async (id: string, docData: Partial<Omit<DocumentType, 'id' | 'files'>>) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'documents', id);
    const dataToUpdate: { [key: string]: any } = { ...docData };
    
    if (docData.studyDate) {
      dataToUpdate.studyDate = Timestamp.fromDate(new Date(docData.studyDate));
    }
    
    // Handle null values to delete fields
    Object.keys(dataToUpdate).forEach(key => {
        if (dataToUpdate[key] === undefined) {
            delete dataToUpdate[key];
        }
    });

    await updateDoc(docRef, dataToUpdate);
  };

  const deleteDocument = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'documents', id));
  };

  const addMedication = async (med: Omit<Medication, 'id'>) => {
      if (!user) return;
      const docRef = await addDoc(collection(db, 'users', user.uid, 'medications'), med);
      setMedications(prev => [...prev, { ...med, id: docRef.id}]);
  };

  const updateMedication = async (id: string, med: Partial<Medication>) => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid, 'medications', id);
      await updateDoc(docRef, med);
      setMedications(prev => prev.map(m => m.id === id ? { ...m, ...med } : m));
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
