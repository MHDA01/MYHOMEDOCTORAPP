
'use server';

import { db } from '@/lib/firebase';
import type { PersonalInfo } from '@/lib/types';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// We need a way to serialize Date objects to be stored in Firestore
// and deserialize them back to Date objects.
type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

// Helper function to introduce a delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getUserProfile(userId: string): Promise<PersonalInfo | null> {
  const docRef = doc(db, 'users', userId);
  const maxRetries = 3;
  const initialDelay = 250; // ms

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
      // If the document doesn't exist, it's not an error.
      // This is an expected condition for a new user.
      return null;
    } catch (error: any) {
      const isPermissionError = error.code === 'permission-denied' || error.code === 'unauthenticated';

      if (isPermissionError && attempt < maxRetries) {
        console.warn(`Attempt ${attempt} to fetch profile failed due to permissions. Retrying...`);
        await sleep(initialDelay * attempt); // Wait a bit longer each time
      } else {
        // For non-permission errors or if we've exhausted retries, throw the error.
        console.error(`Error getting user profile after ${attempt} attempts:`, error);
        throw new Error('Could not fetch user profile.');
      }
    }
  }

  // This should only be reached if all retries fail.
  return null;
}


export async function updateUserProfile(userId: string, data: PersonalInfo): Promise<void> {
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
