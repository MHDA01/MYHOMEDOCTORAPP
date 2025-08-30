'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Medication, Document } from '@/lib/types';
import { auth, db, storage } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, addDoc, updateDoc, deleteDoc, query, orderBy, onSnapshot } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { useToast } from '@/hooks/use-toast';

export const UserContext = createContext<UserContextType | undefined>(undefined);

type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

type SerializableAppointment = Omit<Appointment, 'date'> & {
    date: Timestamp;
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
  medications: Medication[];
  documents: Document[];
  updatePersonalInfo: (info: PersonalInfo) => Promise<void>;
  updateHealthInfo: (info: HealthInfo) => Promise<void>;
  addAppointment: (appointment: Omit<Appointment, 'id' | 'notified'>) => Promise<void>;
  updateAppointment: (id: string, appointment: Partial<Omit<Appointment, 'id'>>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  updateMedication: (id: string, med: Partial<Medication>) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  addDocument: (docData: Omit<Document, 'id' | 'url' | 'filePath'> & { file: File }) => Promise<void>;
  updateDocument: (id: string, data: Partial<Omit<Document, 'id' | 'url' | 'filePath' | 'file'>>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  loading: boolean;
  user: User | null;
  signOutUser: () => Promise<void>;
}

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
  const [medications, setMedications] = useState<Medication[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
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
        const collectionsToSync = ['appointments', 'medications', 'documents'];
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
                if (collName === 'medications') setMedications(data as Medication[]);
                if (collName === 'documents') setDocuments(data as Document[]);

            }, (error) => {
                console.error(`Error listening to ${collName}:`, error);
                toast({ variant: 'destructive', title: 'Error de Sincronización', description: `No se pudo actualizar ${collName}.`});
            });
            unsubscribes.push(unsubscribe);
        });

      } else {
        setUser(null); setPersonalInfo(null); setHealthInfo(null);
        setAppointments([]); setMedications([]);
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

  const addDocument = async (docData: Omit<Document, 'id' | 'url' | 'filePath'> & { file: File }) => {
    if (!user) {
      throw new Error("Usuario no autenticado.");
    }
    
    const docRef = doc(collection(db, 'users', user.uid, 'documents'));
    const docId = docRef.id;

    const filePath = `users/${user.uid}/documents/${docId}-${docData.file.name}`;
    const storageRef = ref(storage, filePath);
    
    await uploadBytes(storageRef, docData.file);
    const downloadURL = await getDownloadURL(storageRef);

    const dataToSave = {
      name: docData.name,
      category: docData.category,
      uploadedAt: Timestamp.now(),
      studyDate: docData.studyDate ? Timestamp.fromDate(docData.studyDate) : Timestamp.now(),
      url: downloadURL,
      filePath: filePath,
    };
    
    await setDoc(docRef, dataToSave);
  };

  const updateDocument = async (id: string, data: Partial<Omit<Document, 'id' | 'url' | 'filePath' | 'file'>>) => {
    if (!user) throw new Error('No user authenticated');
    const docToUpdateRef = doc(db, 'users', user.uid, 'documents', id);
    const serializableData: Partial<any> = { ...data };
    if (data.studyDate) {
      serializableData.studyDate = Timestamp.fromDate(data.studyDate);
    }
    await updateDoc(docToUpdateRef, serializableData);
  };

  const deleteDocument = async (id: string) => {
    if (!user) throw new Error('No user authenticated');
    const docToDeleteRef = doc(db, 'users', user.uid, 'documents', id);
    
    try {
      const docSnap = await getDoc(docToDeleteRef);
      if (docSnap.exists()) {
        const docData = docSnap.data() as Document;
        
        if (docData.filePath) {
          const fileRef = ref(storage, docData.filePath);
          await deleteObject(fileRef);
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
    <UserContext.Provider value={{
        user, loading, personalInfo, healthInfo, appointments, medications, documents,
        signOutUser, updatePersonalInfo, updateHealthInfo, addAppointment, updateAppointment,
        deleteAppointment, addMedication, updateMedication, deleteMedication,
        addDocument, updateDocument, deleteDocument,
    }}>
      {children}
    </UserContext.Provider>
  );
};