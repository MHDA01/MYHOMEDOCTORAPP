
"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
import type { PersonalInfo } from '@/lib/types';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// We need a way to serialize Date objects to be stored in Firestore
// and deserialize them back to Date objects.
type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getUserProfile(userId: string): Promise<PersonalInfo | null> {
    const docRef = doc(db, 'users', userId);
    const maxRetries = 5;
    let delay = 100; // start with 100ms

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data() as SerializablePersonalInfo;
                if (data && data.dateOfBirth) {
                    return {
                        ...data,
                        dateOfBirth: data.dateOfBirth.toDate(),
                    };
                }
            }
            // Document doesn't exist, this is a new user. Not an error.
            return null; 
        } catch (error: any) {
            const isPermissionError = error.code === 'permission-denied' || error.code === 'unauthenticated';
            if (isPermissionError && attempt < maxRetries) {
                console.warn(`Attempt ${attempt} to fetch profile failed. Retrying in ${delay}ms...`);
                await sleep(delay);
                delay *= 2; // Exponential backoff
            } else {
                console.error(`Error getting user profile after ${attempt} attempts:`, error);
                throw new Error('Could not fetch user profile.');
            }
        }
    }
    return null; // Should be unreachable if maxRetries > 0
}

async function updateUserProfile(userId: string, data: PersonalInfo): Promise<void> {
  try {
    const docRef = doc(db, 'users', userId);
    const serializableData: SerializablePersonalInfo = {
        ...data,
        dateOfBirth: Timestamp.fromDate(data.dateOfBirth),
    };
    await setDoc(docRef, serializableData, { merge: true });
  } catch (error) {
    console.error('Error updating user profile:', error);
    throw new Error('Could not update user profile.');
  }
}


interface UserContextType {
  personalInfo: PersonalInfo | null;
  setPersonalInfo: (info: PersonalInfo) => Promise<void>;
  loading: boolean;
  user: User | null;
}

export const UserContext = createContext<UserContextType | undefined>(undefined);

const initialInfo: PersonalInfo = {
  firstName: 'John',
  lastName: 'Doe',
  sex: 'male',
  dateOfBirth: new Date('1985-05-20'),
  insuranceProvider: 'Isapre',
  isapreName: 'Colmena',
};

export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [personalInfo, setPersonalInfoState] = useState<PersonalInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Effect to handle auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
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
  }, []);

  // Effect to fetch or create user profile once we have a stable user object
  useEffect(() => {
    const manageUserProfile = async () => {
      if (user) {
        setLoading(true);
        try {
          const profile = await getUserProfile(user.uid);
          
          if (profile) {
              setPersonalInfoState(profile);
          } else {
              // This is a new user. Create a default profile for them.
              await updateUserProfile(user.uid, initialInfo);
              setPersonalInfoState(initialInfo);
          }
        } catch (error) {
           console.error("Failed to manage user profile:", error);
           // Optionally, set an error state to show in the UI
        } finally {
           setLoading(false);
        }
      }
    }
    
    manageUserProfile();

  }, [user]);

  const setPersonalInfo = async (info: PersonalInfo) => {
    if (user) {
      setPersonalInfoState(info); // Optimistic update
      try {
        await updateUserProfile(user.uid, info);
      } catch (error) {
        console.error("Failed to save profile:", error);
        // Potentially revert or show toast
      }
    } else {
        console.error("No user to save profile for");
    }
  };

  return (
    <UserContext.Provider value={{ user, personalInfo, setPersonalInfo, loading }}>
      {children}
    </UserContext.Provider>
  );
};
