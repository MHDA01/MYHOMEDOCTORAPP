
'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication } from '@/lib/types';
import { auth, db, functions } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { httpsCallable } from 'firebase/functions';

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

type UserDocumentData = {
    personalInfo: SerializablePersonalInfo,
    healthInfo: HealthInfo
}

type UserDocument = {
    personalInfo: PersonalInfo;
    healthInfo: HealthInfo;
}

// --- Generic Firestore Functions ---

async function getCollection<T>(userId: string, collectionName: string): Promise<T[]> {
    let q;
    if (collectionName === 'appointments') {
        q = query(collection(db, 'users', userId, collectionName), orderBy('date', 'desc'));
    } else if (collectionName === 'documents') {
        q = query(collection(db, 'users', userId, collectionName), orderBy('uploadedAt', 'desc'));
    } else {
        q = query(collection(db, 'users', userId, collectionName));
    }
    
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
         const dob = data.personalInfo.dateOfBirth instanceof Date 
            ? data.personalInfo.dateOfBirth 
            : new Date(data.personalInfo.dateOfBirth);
        serializableData.personalInfo = {
            ...data.personalInfo,
            dateOfBirth: Timestamp.fromDate(dob),
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
  
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
      } else {
        setUser(null);
        setPersonalInfo(null);
        setHealthInfo(null);
        setAppointments([]);
        setDocuments([]);
        setMedications([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
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
              const isAnon = user.isAnonymous;
              const defaultPersonalInfo: PersonalInfo = isAnon ? initialAnonymousPersonalInfo : {
                  firstName: user.displayName?.split(' ')[0] || 'Nuevo',
                  lastName: user.displayName?.split(' ').slice(1).join(' ') || 'Usuario',
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
              
              await updateUserDocument(user.uid, { personalInfo: defaultPersonalInfo, healthInfo: defaultHealthInfo });
              setPersonalInfo(defaultPersonalInfo);
              setHealthInfo(defaultHealthInfo);
          }
          
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

  const signOutUser = async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
    }
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

  // Appointments CRUD
    const addAppointment = async (appointment: Omit<Appointment, 'id'>) => {
        if (!user) return;
        const newDocRef = doc(collection(db, 'users', user.uid, 'appointments'));
        const newAppointment = { ...appointment, id: newDocRef.id };
        await setDoc(newDocRef, { ...appointment, date: Timestamp.fromDate(appointment.date) });
        setAppointments(prev => [...prev, newAppointment].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    };
    const updateAppointment = async (id: string, appointment: Partial<Appointment>) => {
        if (!user) return;
        const appointmentDocRef = doc(db, 'users', user.uid, 'appointments', id);
        const data = appointment.date ? { ...appointment, date: Timestamp.fromDate(new Date(appointment.date)) } : appointment;
        await updateDoc(appointmentDocRef, data);
        const updatedAppointmentData = { ...appointments.find(a => a.id === id), ...appointment } as Appointment;
        setAppointments(prev => prev.map(a => a.id === id ? updatedAppointmentData : a).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    };
    const deleteAppointment = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'appointments', id));
        setAppointments(prev => prev.filter(a => a.id !== id));
    };

    // Documents CRUD
    const addDocument = async (docData: Omit<DocumentType, 'id'>) => {
        if (!user) return;
        const newDocRef = doc(collection(db, 'users', user.uid, 'documents'));
        const data = { ...docData, uploadedAt: Timestamp.fromDate(docData.uploadedAt) };
        await setDoc(newDocRef, data);
        setDocuments(prev => [{...docData, id: newDocRef.id},...prev].sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime()));
    };
    const updateDocument = async (id: string, docData: Partial<DocumentType>) => {
        if (!user) return;
        await updateDoc(doc(db, 'users', user.uid, 'documents', id), docData);
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...docData } : d));
    };
    const deleteDocument = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'documents', id));
        setDocuments(prev => prev.filter(d => d.id !== id));
    };

    // Medications CRUD
    const addMedication = async (med: Omit<Medication, 'id'>) => {
        if (!user) return;
        const newDocRef = doc(collection(db, 'users', user.uid, 'medications'));
        const newMed = { ...med, id: newDocRef.id };
        await setDoc(newDocRef, newMed);
        setMedications(prev => [...prev, newMed]);
    };

    const updateMedication = async (id: string, med: Partial<Medication>) => {
        if (!user) return;
        const medicationDocRef = doc(db, 'users', user.uid, 'medications', id);
        await updateDoc(medicationDocRef, med);
        const fullMed = { ...medications.find(m => m.id === id), ...med } as Medication;
        setMedications(prev => prev.map(m => m.id === id ? fullMed : m));
    };
    
    const deleteMedication = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'medications', id));
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
        signOutUser,
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
        deleteMedication,
    }}>
      {children}
    </UserContext.Provider>
  );
};
