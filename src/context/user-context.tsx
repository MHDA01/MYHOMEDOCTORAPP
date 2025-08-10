
'use client';

import { createContext, useState, useEffect, ReactNode, useCallback } from 'react';
import type { PersonalInfo, HealthInfo, Appointment, Document as DocumentType, Medication } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp, collection, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, writeBatch, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';

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
    fcmToken?: string;
}

type UserDocument = {
    personalInfo: PersonalInfo;
    healthInfo: HealthInfo;
    fcmToken?: string;
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
                        healthInfo: data.healthInfo,
                        fcmToken: data.fcmToken
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

// Type for the state of FCM/Push Notifications
type FcmPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';


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
  fcmPermissionState: FcmPermissionState;
  requestNotificationPermission: () => Promise<void>;
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
  const [fcmPermissionState, setFcmPermissionState] = useState<FcmPermissionState>('default');
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const { toast } = useToast();
  

  const checkNotificationSupportAndPermission = useCallback(async () => {
    const supported = await isSupported();
    if (!supported || !('PushManager' in window)) {
      setFcmPermissionState('unsupported');
      return;
    }
    setFcmPermissionState(Notification.permission);
  }, []);

  useEffect(() => {
    checkNotificationSupportAndPermission();
  }, [checkNotificationSupportAndPermission]);


  const requestNotificationPermission = async () => {
    if (fcmPermissionState !== 'default') return;

    try {
      const permission = await Notification.requestPermission();
      // This will re-trigger the check in the useEffect, updating the state
      setFcmPermissionState(permission);

      if (permission === 'granted' && user) {
        toast({ title: "Permiso concedido", description: "Obteniendo token..." });
        const messaging = getMessaging();
        const newFcmToken = await getToken(messaging, { vapidKey: 'BDSm_gZ27Y6gW6S_q0CEy_yO25OHj-bCFsM0eyIu5m_4tA_gI4-XjJ8g_1o2hZ8w_8Y9c9Z8w9_X_8x8y_A' });
        
        if (newFcmToken) {
            setFcmToken(newFcmToken);
            await updateUserDocument(user.uid, { fcmToken: newFcmToken });
            toast({ title: "¡Éxito!", description: "Las notificaciones han sido activadas." });
        } else {
             toast({ variant: 'destructive', title: "Error", description: "No se pudo obtener el token de notificación." });
        }
      } else if (permission === 'denied') {
        toast({ variant: 'destructive', title: "Permiso denegado", description: "Las notificaciones están bloqueadas en la configuración de tu navegador." });
      }

    } catch (error) {
      console.error('Error requesting notification permission:', error);
      toast({ variant: 'destructive', title: "Error de Notificación", description: "Ocurrió un error al solicitar el permiso." });
    }
  };


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
              setFcmToken(userDoc.fcmToken || null);
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

  // Set up foreground message handler
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && fcmPermissionState === 'granted') {
        const messaging = getMessaging();
        const unsubscribe = onMessage(messaging, (payload) => {
            console.log('Foreground message received.', payload);
            toast({
                title: payload.notification?.title,
                description: payload.notification?.body,
            });
        });
        return () => unsubscribe();
    }
  }, [fcmPermissionState, toast]);


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

  const addAlarm = async (data: any) => {
    try {
        await addDoc(collection(db, 'alarms'), {
            ...data,
            createdAt: Timestamp.now(),
        });
    } catch (error) {
        console.error("Error adding alarm: ", error);
    }
  };

    const deleteAlarmsForParent = async (parentId: string, type: 'medicationId' | 'appointmentId') => {
        if (!user) return;
        const q = query(collection(db, "alarms"), where(type, "==", parentId));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
    }

  // Appointments CRUD
    const addAppointment = async (appointment: Omit<Appointment, 'id'>) => {
        if (!user) return;
        const newDocRef = doc(collection(db, 'users', user.uid, 'appointments'));
        const newAppointment = { ...appointment, id: newDocRef.id };
        await setDoc(newDocRef, { ...appointment, date: Timestamp.fromDate(appointment.date) });
        setAppointments(prev => [...prev, newAppointment].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
        
        if (fcmToken && appointment.reminder && appointment.reminder !== 'none') {
             const reminderTimeMap: {[key: string]: number} = {'1h': 60, '2h': 120, '24h': 1440, '2d': 2880 };
             const minutesBefore = reminderTimeMap[appointment.reminder];
             if(minutesBefore) {
                 const alarmTime = new Date(appointment.date.getTime() - minutesBefore * 60 * 1000);
                 await addAlarm({
                    userId: user.uid,
                    appointmentId: newDocRef.id,
                    fcmToken,
                    title: "Recordatorio de Cita",
                    message: `Tu cita con ${appointment.doctor} (${appointment.specialty}) es pronto.`,
                    alarmTime: Timestamp.fromDate(alarmTime),
                    clickAction: '/dashboard#appointments'
                });
             }
        }
    };
    const updateAppointment = async (id: string, appointment: Partial<Appointment>) => {
        if (!user) return;
        const appointmentDocRef = doc(db, 'users', user.uid, 'appointments', id);
        const data = appointment.date ? { ...appointment, date: Timestamp.fromDate(new Date(appointment.date)) } : appointment;
        await updateDoc(appointmentDocRef, data);
        setAppointments(prev => prev.map(a => a.id === id ? { ...a, ...appointment } : a).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        
        // Update associated alarm
        await deleteAlarmsForParent(id, 'appointmentId');
        const updatedAppointment = { ...appointments.find(a => a.id === id), ...appointment };
        if (fcmToken && updatedAppointment.reminder && updatedAppointment.reminder !== 'none' && updatedAppointment.date) {
            const reminderTimeMap: {[key: string]: number} = {'1h': 60, '2h': 120, '24h': 1440, '2d': 2880 };
             const minutesBefore = reminderTimeMap[updatedAppointment.reminder];
             if(minutesBefore) {
                 const alarmTime = new Date(new Date(updatedAppointment.date).getTime() - minutesBefore * 60 * 1000);
                 await addAlarm({
                    userId: user.uid,
                    appointmentId: id,
                    fcmToken,
                    title: "Recordatorio de Cita Actualizado",
                    message: `Tu cita con ${updatedAppointment.doctor} (${updatedAppointment.specialty}) es pronto.`,
                    alarmTime: Timestamp.fromDate(alarmTime),
                    clickAction: '/dashboard#appointments'
                });
             }
        }
    };
    const deleteAppointment = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'appointments', id));
        await deleteAlarmsForParent(id, 'appointmentId');
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
        
        if (med.active && fcmToken) {
            for (const time of med.time) {
                const [hours, minutes] = time.split(':').map(Number);
                const alarmTime = new Date();
                alarmTime.setHours(hours, minutes, 0, 0);

                if (alarmTime < new Date()) {
                    alarmTime.setDate(alarmTime.getDate() + 1);
                }

                await addAlarm({
                    userId: user.uid,
                    medicationId: newMed.id,
                    fcmToken: fcmToken,
                    title: 'Hora de tu Medicina',
                    message: `${med.name} ${med.dosage}`,
                    alarmTime: Timestamp.fromDate(alarmTime),
                    isRecurring: true, 
                    frequency: med.frequency,
                    clickAction: '/dashboard#medications'
                });
            }
        }
    };

    const updateMedication = async (id: string, med: Partial<Medication>) => {
        if (!user) return;
        
        const fullMedRef = doc(db, 'users', user.uid, 'medications', id);
        await updateDoc(fullMedRef, med);
        const updatedMedDocSnap = await getDoc(fullMedRef);
        const fullMed = updatedMedDocSnap.data() as Medication;

        await deleteAlarmsForParent(id, 'medicationId');

        if (fullMed.active && fcmToken) {
             for (const time of fullMed.time) {
                const [hours, minutes] = time.split(':').map(Number);
                const alarmTime = new Date();
                alarmTime.setHours(hours, minutes, 0, 0);
                 if (alarmTime < new Date()) {
                    alarmTime.setDate(alarmTime.getDate() + 1);
                }
                await addAlarm({
                    userId: user.uid,
                    medicationId: id,
                    fcmToken: fcmToken,
                    title: 'Hora de tu Medicina',
                    message: `${fullMed.name} ${fullMed.dosage}`,
                    alarmTime: Timestamp.fromDate(alarmTime),
                    isRecurring: true,
                    frequency: fullMed.frequency,
                    clickAction: '/dashboard#medications'
                });
            }
        }
        
        setMedications(prev => prev.map(m => m.id === id ? { ...m, ...fullMed, ...med } : m));
    };
    
    const deleteMedication = async (id: string) => {
        if (!user) return;
        await deleteDoc(doc(db, 'users', user.uid, 'medications', id));
        await deleteAlarmsForParent(id, 'medicationId');
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
        fcmPermissionState,
        requestNotificationPermission
    }}>
      {children}
    </UserContext.Provider>
  );
};
