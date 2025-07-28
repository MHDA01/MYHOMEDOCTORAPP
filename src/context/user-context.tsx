
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
        // User is signed in, see docs for a list of available properties
        // https://firebase.google.com/docs/reference/js/firebase.User
        const profile = await getUserProfile(currentUser.uid);
        if (profile) {
            setPersonalInfoState(profile);
        } else {
            // If no profile exists, create one with initial data
            await updateUserProfile(currentUser.uid, initialInfo);
            setPersonalInfoState(initialInfo);
        }
      } else {
        // User is signed out, sign in anonymously
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
