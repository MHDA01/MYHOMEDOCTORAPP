
"use client";

import { createContext, useState, useEffect, ReactNode, Dispatch, SetStateAction } from 'react';
import type { PersonalInfo } from '@/lib/types';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import { getUserProfile, updateUserProfile } from '@/services/userService';

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        const profile = await getUserProfile(currentUser.uid);
        
        if (profile) {
            setPersonalInfoState(profile);
        } else {
            // This is likely a new user (or a fresh anonymous one).
            // Let's create a profile for them.
            try {
                await updateUserProfile(currentUser.uid, initialInfo);
                setPersonalInfoState(initialInfo);
            } catch (error) {
                console.error("Failed to create initial user profile:", error);
            }
        }
      } else {
        // User is signed out, or it's the initial load and we have no user yet.
        // Attempt to sign in anonymously.
        // onAuthStateChanged will run again once the sign-in is complete.
        signInAnonymously(auth).catch((error) => {
          console.error("Anonymous sign-in failed:", error);
        });
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const setPersonalInfo = async (info: PersonalInfo) => {
    if (user) {
      await updateUserProfile(user.uid, info);
      setPersonalInfoState(info);
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
