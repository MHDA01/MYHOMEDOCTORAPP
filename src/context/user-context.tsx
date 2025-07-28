
'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';

// We need a way to serialize Date objects to be stored in Firestore
// and deserialize them back to Date objects.
type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

type SerializableAppointment = Omit<Appointment, 'date'> & {
    date: Timestamp;
};

type SerializableDocument = Omit<DocumentType, 'uploadedAt'> & {
    uploadedAt: Timestamp;
};

type UserDocument = {
    personalInfo: SerializablePersonalInfo,
    healthInfo: HealthInfo
}

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Generic Firestore Functions ---

async function getCollection<T>(userId: string, collectionName: string): Promise<T[]> {
    const q = query(collection(db, 'users', userId, collectionName), orderBy('uploadedAt', 'desc'));
    if (collectionName === 'appointments') {
        // Appointments are not ordered by uploadedAt
        const plainQuery = collection(db, 'users', userId, collectionName);
        const snapshot = await getDocs(plainQuery);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
    }
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as T));
}

async function addToCollection<T extends { [x: string]: any }>(userId: string, collectionName: string, data: Omit<T, 'id'>): Promise<T> {
    const docRef = await addDoc(collection(db, 'users', userId, collectionName), data);
    return { id: docRef.id, ...data } as T;
}

async function updateInCollection<T extends { [x: string]: any }>(userId: string, collectionName: string, id: string, data: Partial<T>) {
    const docRef = doc(db, 'users', userId, collectionName, id);
    await updateDoc(docRef, data);
}

async function deleteFromCollection(userId: string, collectionName: string, id: string) {
    const docRef = doc(db, 'users', userId, collectionName, id);
    await deleteDoc(docRef);
}


async function getUserDocument(userId: string): Promise<{ personalInfo: PersonalInfo; healthInfo: HealthInfo } | null> {
    const docRef = doc(db, 'users', userId);
    const maxRetries = 5;
    let delay = 200;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as UserDocument;
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
        } catch (error: any) {
             const isPermissionError = error.code === 'permission-denied' || error.code === 'unauthenticated';
            if (isPermissionError && attempt < maxRetries) {
                console.warn(`Attempt ${attempt} to fetch profile failed due to permissions. Retrying in ${delay}ms...`);
                await sleep(delay);
                delay *= 2; 
            } else {
                console.error(`Error getting user profile after ${attempt} attempts:`, error);
                throw new Error('Could not fetch user profile.');
            }
        }
    }
    throw new Error('Could not fetch user profile after all retries.');
}

async function updateUserDocument(userId: string, data: { personalInfo: PersonalInfo, healthInfo: HealthInfo }): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId);
    const dob = data.personalInfo.dateOfBirth instanceof Date 
        ? data.personalInfo.dateOfBirth 
        : new Date(data.personalInfo.dateOfBirth);

    const serializableData: UserDocument = {
        personalInfo: {
            ...data.personalInfo,
            dateOfBirth: Timestamp.fromDate(dob),
        },
        healthInfo: data.healthInfo
    };
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
  addAppointment: (appointment: Omit<Appointment, 'id'>) => Promise<void>;
  updateAppointment: (id: string, appointment: Partial<Appointment>) => Promise<void>;
  deleteAppointment: (id: string) => Promise<void>;
  addDocument: (doc: Omit<DocumentType, 'id'>) => Promise<void>;
  updateDocument: (id: string, doc: Partial<DocumentType>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  addMedication: (med: Omit<Medication, 'id'>) => Promise<void>;
  updateMedication: (id: string, med: Partial<Medication>) => Promise<void>;
  deleteMedication: (id: string) => Promise<void>;
  loading: boolean;
  user: User | null;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

const initialPersonalInfo: PersonalInfo = {
  firstName: 'John',
  lastName: 'Doe',
  sex: 'male',
  dateOfBirth: new Date('1985-05-20'),
  insuranceProvider: 'Isapre',
  isapreName: 'Colmena',
};

const initialHealthInfo: HealthInfo = {
    allergies: ['Cacahuetes', 'Penicilina'],
    medications: ['Lisinopril 10mg', 'Metformina 500mg'],
    pathologicalHistory: 'Hipertensión Arterial diagnosticada en 2010. Diabetes Mellitus tipo 2 diagnosticada en 2015.',
    surgicalHistory: 'Apendicectomía en 2005. Colecistectomía laparoscópica en 2018.',
    gynecologicalHistory: '',
    emergencyContacts: [
      { id: '1', name: 'Jane Doe', phone: '123-456-7890', relationship: 'Esposa' },
      { id: '2', name: 'Dr. Smith', phone: '098-765-4321', relationship: 'Médico de cabecera' },
    ],
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo | null>(null);
  const [healthInfo, setHealthInfo] = useState<HealthInfo | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [documents, setDocuments] = useState<DocumentType[]>([]);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
      } else if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
          setLoading(false); 
        }
      }
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const manageUserProfile = async () => {
      if (user) {
        setLoading(true);
        try {
          const userDoc = await getUserDocument(user.uid);
          
          if (userDoc) {
              setPersonalInfo(userDoc.personalInfo);
              setHealthInfo(userDoc.healthInfo);
          } else {
              await updateUserDocument(user.uid, { personalInfo: initialPersonalInfo, healthInfo: initialHealthInfo });
              setPersonalInfo(initialPersonalInfo);
              setHealthInfo(initialHealthInfo);
          }
          
          // Fetch subcollections
          const [appointmentsData, documentsData, medicationsData] = await Promise.all([
              getCollection<SerializableAppointment>(user.uid, 'appointments'),
              getCollection<SerializableDocument>(user.uid, 'documents'),
              getCollection<Medication>(user.uid, 'medications'),
          ]);

          setAppointments(appointmentsData.map(a => ({...a, date: a.date.toDate() })));
          setDocuments(documentsData.map(d => ({...d, uploadedAt: d.uploadedAt.toDate() })));
          setMedications(medicationsData);

        } catch (error) {
           console.error("Failed to manage user profile:", error);
        } finally {
           setLoading(false);
        }
      }
    };
    
    if(user) {
      manageUserProfile();
    }
  }, [user]);

  const updatePersonalInfo = async (info: PersonalInfo) => {
    if (user && healthInfo) {
      setPersonalInfo(info);
      try {
        await updateUserDocument(user.uid, { personalInfo: info, healthInfo });
      } catch (error) {
        console.error("Failed to save personal info:", error);
      }
    }
  };

  const updateHealthInfo = async (info: HealthInfo) => {
      if (user && personalInfo) {
          setHealthInfo(info);
          try {
              await updateUserDocument(user.uid, { personalInfo, healthInfo: info });
          } catch(error) {
              console.error("Failed to save health info:", error);
          }
      }
  };

  // Appointments CRUD
    const addAppointment = async (appointment: Omit<Appointment, 'id'>) => {
        if (!user) return;
        const data = { ...appointment, date: Timestamp.fromDate(appointment.date) };
        const newDoc = await addToCollection(user.uid, 'appointments', data);
        setAppointments(prev => [...prev, { ...appointment, id: newDoc.id }]);
    };
    const updateAppointment = async (id: string, appointment: Partial<Appointment>) => {
        if (!user) return;
        const data = appointment.date ? { ...appointment, date: Timestamp.fromDate(appointment.date) } : appointment;
        await updateInCollection(user.uid, 'appointments', id, data);
        setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...appointment } : a));
    };
    const deleteAppointment = async (id: string) => {
        if (!user) return;
        await deleteFromCollection(user.uid, 'appointments', id);
        setAppointments(prev => prev.filter(a => a.id !== id));
    };

    // Documents CRUD
    const addDocument = async (doc: Omit<DocumentType, 'id'>) => {
        if (!user) return;
        const data = { ...doc, uploadedAt: Timestamp.fromDate(doc.uploadedAt) };
        const newDoc = await addToCollection(user.uid, 'documents', data);
        setDocuments(prev => [{ ...doc, id: newDoc.id },...prev]);
    };
    const updateDocument = async (id: string, doc: Partial<DocumentType>) => {
        if (!user) return;
        await updateInCollection(user.uid, 'documents', id, doc);
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...doc } : d));
    };
    const deleteDocument = async (id: string) => {
        if (!user) return;
        await deleteFromCollection(user.uid, 'documents', id);
        setDocuments(prev => prev.filter(d => d.id !== id));
    };

    // Medications CRUD
    const addMedication = async (med: Omit<Medication, 'id'>) => {
        if (!user) return;
        const newDoc = await addToCollection(user.uid, 'medications', med);
        setMedications(prev => [...prev, { ...med, id: newDoc.id }]);
    };
    const updateMedication = async (id: string, med: Partial<Medication>) => {
        if (!user) return;
        await updateInCollection(user.uid, 'medications', id, med);
        setMedications(prev => prev.map(m => m.id === id ? { ...m, ...med } : m));
    };
    const deleteMedication = async (id: string) => {
        if (!user) return;
        await deleteFromCollection(user.uid, 'medications', id);
        setMedications(prev => prev.filter(m => m.id !== id));
    };


  return (
    <UserContext.Provider value={{
        user,
        loading,
        personalInfo,
        healthInfo,
        appointments,
        documents,
        medications,
        updatePersonalInfo,
        updateHealthInfo,
        addAppointment,
        updateAppointment,
        deleteAppointment,
        addDocument,
        updateDocument,
        deleteDocument,
        addMedication,
        updateMedication,
        deleteMedication
    }}>
      {children}
    </UserContext.Provider>
  );
};
