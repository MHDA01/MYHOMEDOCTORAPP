
"use client";

import { createContext, useState, useEffect, ReactNode } from 'react';
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

  // Effect to handle auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
      } else {
        // No user, sign in anonymously. onAuthStateChanged will run again.
        signInAnonymously(auth).catch((error) => {
          console.error("Anonymous sign-in failed:", error);
          setLoading(false); 
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Effect to fetch or create user profile once we have a stable user object
  useEffect(() => {
    const manageUserProfile = async () => {
      if (user) {
        setLoading(true);
        const profile = await getUserProfile(user.uid);
        
        if (profile) {
            setPersonalInfoState(profile);
        } else {
            // This is a new user (anonymous or otherwise).
            // Let's create a default profile for them.
            try {
                await updateUserProfile(user.uid, initialInfo);
                setPersonalInfoState(initialInfo);
            } catch (error) {
                console.error("Failed to create initial user profile:", error);
            }
        }
        setLoading(false);
      }
    }
    
    manageUserProfile();

  }, [user]);

  const setPersonalInfo = async (info: PersonalInfo) => {
    if (user) {
      // Optimistic update for better UX
      setPersonalInfoState(info);
      try {
        await updateUserProfile(user.uid, info);
      } catch (error) {
        console.error("Failed to save profile, reverting:", error);
        // Revert on failure (optional, depends on desired UX)
        // For now, we just log the error. A toast notification would be better.
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
