
'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication } from '@/lib/types';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useToast } from '@/hooks/use-toast';

type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

type SerializableAppointment = Omit<Appointment, 'date'> & {
    date: Timestamp;
};

type SerializableDocument = Omit<DocumentType, 'uploadedAt' | 'studyDate' | 'file'> & {
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
  updateDocument: (id: string, doc: Partial<Omit<DocumentType, 'id' | 'file'>>) => Promise<void>;
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
  
  const loadInitialData = useCallback(async (currentUser: User) => {
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
    } catch (error) {
       console.error("Failed to manage user profile:", error);
       toast({ variant: 'destructive', title: 'Error de Carga', description: 'No se pudieron cargar los datos del perfil.'});
    } finally {
        setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    let unsubscribes: (() => void)[] = [];

    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      // Clean up previous listeners
      unsubscribes.forEach(unsub => unsub());
      unsubscribes = [];

      if (currentUser) {
        setUser(currentUser);
        await loadInitialData(currentUser);

        // Set up real-time listeners for subcollections
        const collectionsToSync = ['appointments', 'documents', 'medications'];
        collectionsToSync.forEach(collName => {
            const q = query(collection(db, 'users', currentUser.uid, collName), orderBy('uploadedAt', 'desc'));
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const data = snapshot.docs.map(doc => {
                    const docData = doc.data();
                    const id = doc.id;
                    // Convert timestamps
                    Object.keys(docData).forEach(key => {
                        if (docData[key] instanceof Timestamp) {
                            docData[key] = docData[key].toDate();
                        }
                    });
                    return { id, ...docData };
                });
                
                if (collName === 'appointments') setAppointments(data as Appointment[]);
                if (collName === 'documents') setDocuments(data as DocumentType[]);
                if (collName === 'medications') setMedications(data as Medication[]);

            }, (error) => {
                console.error(`Error listening to ${collName}:`, error);
                toast({ variant: 'destructive', title: 'Error de Sincronización', description: `No se pudo actualizar ${collName}.`});
            });
            unsubscribes.push(unsubscribe);
        });

      } else {
        setUser(null); setPersonalInfo(null); setHealthInfo(null);
        setAppointments([]); setDocuments([]); setMedications([]);
        setLoading(false);
      }
    });

    unsubscribes.push(unsubscribeAuth);

    return () => {
        unsubscribes.forEach(unsub => unsub());
    };
  }, [loadInitialData, toast]);
  
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
      const dataWithTimestamp = {
          ...appointment,
          date: Timestamp.fromDate(appointment.date),
          uploadedAt: Timestamp.now(), // For consistent ordering
          notified: false,
      };
      await addDoc(collection(db, 'users', user.uid, 'appointments'), dataWithTimestamp);
  };
  
  const updateAppointment = async (id: string, appointment: Partial<Omit<Appointment, 'id'>>) => {
      if (!user) return;
      const docRef = doc(db, 'users', user.uid, 'appointments', id);
      const dataToUpdate: any = { ...appointment, notified: false };
      if (appointment.date) {
        dataToUpdate.date = Timestamp.fromDate(new Date(appointment.date));
      }
      await updateDoc(docRef, dataToUpdate);
  };
  
  const deleteAppointment = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'appointments', id));
  };
  
  const addDocument = async (docData: Omit<DocumentType, 'id'>) => {
    if (!user || !docData.file) {
      throw new Error("Usuario no autenticado o archivo no proporcionado.");
    }
    
    // This is a robust, sequential flow to ensure reliability.
    try {
        console.log("addDocument: Iniciando subida...");
        const docRef = doc(collection(db, 'users', user.uid, 'documents'));
        const docId = docRef.id;

        const filePath = `users/${user.uid}/documents/${docId}-${docData.file.name}`;
        const storageRef = ref(storage, filePath);
        
        console.log(`addDocument: Subiendo a la ruta: ${filePath}`);
        const snapshot = await uploadBytes(storageRef, docData.file);
        console.log("addDocument: Subida a Storage completada.");
        
        const downloadURL = await getDownloadURL(snapshot.ref);
        console.log("addDocument: URL de descarga obtenida.");

        const dataToSave: Omit<SerializableDocument, 'id'> = {
            name: docData.name,
            category: docData.category,
            uploadedAt: Timestamp.now(),
            studyDate: docData.studyDate ? Timestamp.fromDate(docData.studyDate) : Timestamp.now(),
            url: downloadURL,
        };
        
        console.log("addDocument: Guardando documento en Firestore...");
        await setDoc(docRef, dataToSave);
        console.log("addDocument: Documento guardado en Firestore exitosamente.");

    } catch (error) {
        console.error("addDocument: Error en el proceso de subida:", error);
        // Re-throw the error so the calling component can handle it and show a toast.
        throw new Error("No se pudo subir el documento. Inténtalo de nuevo.");
    }
  };

  const updateDocument = async (id: string, docData: Partial<Omit<DocumentType, 'id' | 'file'>>) => {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid, 'documents', id);
    const dataToUpdate: { [key: string]: any } = { ...docData };
    
    if (docData.studyDate) {
      dataToUpdate.studyDate = Timestamp.fromDate(new Date(docData.studyDate));
    }
    
    await updateDoc(docRef, dataToUpdate);
  };

  const deleteDocument = async (id: string) => {
      if (!user) return;
      // Note: This does not delete the file from Storage to prevent accidental data loss.
      // A cleanup function could be implemented for this.
      await deleteDoc(doc(db, 'users', user.uid, 'documents', id));
  };

  const addMedication = async (med: Omit<Medication, 'id'>) => {
      if (!user) return;
      const dataWithTimestamp = { ...med, uploadedAt: Timestamp.now() };
      await addDoc(collection(db, 'users', user.uid, 'medications'), dataWithTimestamp);
  };

  const updateMedication = async (id: string, med: Partial<Medication>) => {
      if (!user) return;
      await updateDoc(doc(db, 'users', user.uid, 'medications', id), med);
  };
  
  const deleteMedication = async (id: string) => {
      if (!user) return;
      await deleteDoc(doc(db, 'users', user.uid, 'medications', id));
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
