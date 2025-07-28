
"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
import type { PersonalInfo, HealthInfo } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// We need a way to serialize Date objects to be stored in Firestore
// and deserialize them back to Date objects.
type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

type UserDocument = {
    personalInfo: SerializablePersonalInfo,
    healthInfo: HealthInfo
}


// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
                // For other errors or if we've exhausted retries, throw the error.
                console.error(`Error getting user profile after ${attempt} attempts:`, error);
                throw new Error('Could not fetch user profile.');
            }
        }
    }
    // This should be unreachable if maxRetries > 0, but typescript needs a return path.
    throw new Error('Could not fetch user profile after all retries.');
}

async function updateUserDocument(userId: string, data: { personalInfo: PersonalInfo, healthInfo: HealthInfo }): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId);
    // Ensure dateOfBirth is a Date object before converting to Timestamp
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
  updatePersonalInfo: (info: PersonalInfo) => Promise<void>;
  updateHealthInfo: (info: HealthInfo) => Promise<void>;
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
  const [loading, setLoading] = useState(true);

  // Effect to handle auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
      } else if (!user) { // Only sign in anonymously if there's no user at all
        try {
          await signInAnonymously(auth);
          // onAuthStateChanged will be triggered again with the new anonymous user
        } catch (error) {
          console.error("Anonymous sign-in failed:", error);
          setLoading(false); 
        }
      }
    });
    return () => unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Effect to fetch or create user profile once we have a stable user object
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
              // This is a new user. Create a default profile for them.
              await updateUserDocument(user.uid, { personalInfo: initialPersonalInfo, healthInfo: initialHealthInfo });
              setPersonalInfo(initialPersonalInfo);
              setHealthInfo(initialHealthInfo);
          }
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
      setPersonalInfo(info); // Optimistic update
      try {
        await updateUserDocument(user.uid, { personalInfo: info, healthInfo });
      } catch (error) {
        console.error("Failed to save personal info:", error);
      }
    } else {
        console.error("No user or health info to save profile for");
    }
  };

  const updateHealthInfo = async (info: HealthInfo) => {
      if (user && personalInfo) {
          setHealthInfo(info); // Optimistic update
          try {
              await updateUserDocument(user.uid, { personalInfo, healthInfo: info });
          } catch(error) {
              console.error("Failed to save health info:", error);
          }
      } else {
        console.error("No user or personal info to save profile for");
      }
  }

  return (
    <UserContext.Provider value={{ user, personalInfo, updatePersonalInfo, healthInfo, updateHealthInfo, loading }}>
      {children}
    </UserContext.Provider>
  );
};
