
'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, writeBatch, where } from 'firebase/firestore';

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
    healthInfo: HealthInfo,
}

type UserDocument = {
    personalInfo: PersonalInfo;
    healthInfo: HealthInfo;
}

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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


async function getUserDocument(userId: string): Promise<UserDocument | null> {
    const docRef = doc(db, 'users', userId);
    const maxRetries = 5;
    let delay = 200;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as UserDocumentData;
                if (data && data.personalInfo && data.personalInfo.dateOfBirth) {
                     return {
                        personalInfo: {
                            ...data.personalInfo,
                            dateOfBirth: data.personalInfo.dateOfBirth.toDate(),
                        },
                        healthInfo: data.healthInfo
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

async function updateUserDocument(userId: string, data: Partial<UserDocument>): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId);
    
    const serializableData: Partial<UserDocumentData> = { ...data };
    if (data.personalInfo) {
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
  
  const scheduleNotification = useCallback((id: string, title: string, body: string, date: Date, tag?: string) => {
    if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (!reg) return;
        reg.showNotification(title, {
          tag: tag || id,
          body: body,
          showTrigger: new (window as any).TimestampTrigger(date.getTime()),
          icon: '/icons/icon-192x192.png',
        });
      });
    }
  }, []);
  
  const cancelNotification = useCallback((tag: string) => {
     if ('serviceWorker' in navigator && Notification.permission === 'granted') {
        navigator.serviceWorker.getRegistration().then(async reg => {
            if (!reg) return;
            const notifications = await reg.getNotifications({ tag: tag });
            notifications.forEach(notification => notification.close());
        });
    }
  }, []);

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
        await updateUserDocument(user.uid, { personalInfo: info });
      } catch (error) {
        console.error("Failed to save personal info:", error);
      }
    }
  };

  const updateHealthInfo = async (info: HealthInfo) => {
      if (user) {
          setHealthInfo(info);
          try {
              await updateUserDocument(user.uid, { healthInfo: info });
          } catch(error) {
              console.error("Failed to save health info:", error);
          }
      }
  };


  // Appointments CRUD
    const addAppointment = async (appointment: Omit<Appointment, 'id'>) => {
        if (!user) return;
        
        const newDocRef = doc(collection(db, 'users', user.uid, 'appointments'));
        const newAppointment = { ...appointment, id: newDocRef.id };
        
        await setDoc(newDocRef, { ...appointment, date: Timestamp.fromDate(appointment.date) });
        
        const newAppointments = [...appointments, newAppointment].sort((a,b) => b.date.getTime() - a.date.getTime());
        setAppointments(newAppointments);

        if (appointment.reminder && appointment.reminder !== 'none') {
            const reminderMinutes: { [key: string]: number } = { '1h': 60, '2h': 120, '24h': 1440, '2d': 2880 };
            const reminderValue = reminderMinutes[appointment.reminder];
            if(reminderValue) {
                const alarmTime = new Date(appointment.date.getTime() - reminderValue * 60 * 1000);
                if (alarmTime > new Date()) {
                     scheduleNotification(
                       newAppointment.id,
                       'Recordatorio de Cita',
                       `Tu cita con ${appointment.doctor} es pronto.`,
                       alarmTime
                     );
                }
            }
        }
    };
    const updateAppointment = async (id: string, appointment: Partial<Appointment>) => {
        if (!user) return;
        cancelNotification(id);
        const data = appointment.date ? { ...appointment, date: Timestamp.fromDate(appointment.date) } : appointment;
        await updateInCollection(user.uid, 'appointments', id, data);
        setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...appointment } : a).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

        const updatedAppointment = { ...appointments.find(a => a.id === id), ...appointment };
        if (updatedAppointment.reminder && updatedAppointment.reminder !== 'none' && updatedAppointment.date) {
            const reminderMinutes: { [key: string]: number } = { '1h': 60, '2h': 120, '24h': 1440, '2d': 2880 };
            const reminderValue = reminderMinutes[updatedAppointment.reminder];
            if (reminderValue) {
                const alarmTime = new Date(updatedAppointment.date.getTime() - reminderValue * 60 * 1000);
                 if (alarmTime > new Date()) {
                    scheduleNotification(
                       id,
                       'Cita Actualizada',
                       `Tu cita con ${updatedAppointment.doctor} ha sido reagendada.`,
                       alarmTime
                     );
                }
            }
        }
    };
    const deleteAppointment = async (id: string) => {
        if (!user) return;
        cancelNotification(id);
        await deleteFromCollection(user.uid, 'appointments', id);
        setAppointments(prev => prev.filter(a => a.id !== id));
    };

    // Documents CRUD
    const addDocument = async (docData: Omit<DocumentType, 'id'>) => {
        if (!user) return;
        const data = { ...docData, uploadedAt: Timestamp.fromDate(docData.uploadedAt) };
        const newDoc = await addToCollection(user.uid, 'documents', data);
        setDocuments(prev => [{ ...docData, id: newDoc.id },...prev]);
    };
    const updateDocument = async (id: string, docData: Partial<DocumentType>) => {
        if (!user) return;
        await updateInCollection(user.uid, 'documents', id, docData);
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...docData } : d));
    };
    const deleteDocument = async (id: string) => {
        if (!user) return;
        await deleteFromCollection(user.uid, 'documents', id);
        setDocuments(prev => prev.filter(d => d.id !== id));
    };

    // Medications CRUD
    const addMedication = async (med: Omit<Medication, 'id'>) => {
        if (!user) return;

        const newDocRef = doc(collection(db, 'users', user.uid, 'medications'));
        const newMed = { ...med, id: newDocRef.id };
        
        await setDoc(newDocRef, newMed);
        setMedications(prev => [...prev, newMed]);

        if (med.active) {
            med.time.forEach(t => {
                const [hours, minutes] = t.split(':').map(Number);
                let alarmTime = new Date();
                alarmTime.setHours(hours, minutes, 0, 0);

                 // Si la hora ya pasó hoy, programarla para mañana.
                 if (alarmTime < new Date()) {
                    alarmTime.setDate(alarmTime.getDate() + 1);
                 }
                 
                 scheduleNotification(
                    `${newMed.id}-${t}`,
                    "¡Hora de tu medicina!",
                    `${med.name} ${med.dosage}`,
                    alarmTime
                 );
            });
        }
    };
    const updateMedication = async (id: string, med: Partial<Medication>) => {
        if (!user) return;
        
        const oldMed = medications.find(m => m.id === id);
        if (oldMed) {
            oldMed.time.forEach(t => cancelNotification(`${id}-${t}`));
        }

        await updateInCollection(user.uid, 'medications', id, med);
        const updatedMedications = medications.map(m => m.id === id ? { ...m, ...med } : m);
        setMedications(updatedMedications);
        
        const updatedMed = updatedMedications.find(m => m.id === id);
        if(updatedMed?.active && updatedMed.time) {
            updatedMed.time.forEach(t => {
                 const [hours, minutes] = t.split(':').map(Number);
                 let alarmTime = new Date();
                 alarmTime.setHours(hours, minutes, 0, 0);
                 
                  if (alarmTime < new Date()) {
                    alarmTime.setDate(alarmTime.getDate() + 1);
                 }

                 scheduleNotification(
                    `${id}-${t}`,
                    "¡Hora de tu medicina!",
                    `${updatedMed.name} ${updatedMed.dosage}`,
                    alarmTime
                 );
            });
        }
    };
    const deleteMedication = async (id: string) => {
        if (!user) return;

        const medToDelete = medications.find(m => m.id === id);
        if (medToDelete) {
           medToDelete.time.forEach(t => cancelNotification(`${id}-${t}`));
        }
        
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
        deleteMedication,
    }}>
      {children}
    </UserContext.Provider>
  );
};
