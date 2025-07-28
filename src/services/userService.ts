
'use server';

import { db } from '@/lib/firebase';
import type { PersonalInfo } from '@/lib/types';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

// We need a way to serialize Date objects to be stored in Firestore
// and deserialize them back to Date objects.
type SerializablePersonalInfo = Omit<PersonalInfo, 'dateOfBirth'> & {
  dateOfBirth: Timestamp;
};

export async function getUserProfile(userId: string): Promise<PersonalInfo | null> {
  try {
    const docRef = doc(db, 'users', userId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const data = docSnap.data() as SerializablePersonalInfo;
      return {
        ...data,
        dateOfBirth: data.dateOfBirth.toDate(),
      };
    } else {
      console.log('No such document!');
      return null;
    }
  } catch (error) {
    console.error('Error getting user profile:', error);
    throw new Error('Could not fetch user profile.');
  }
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
