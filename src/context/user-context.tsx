"use client";

import { createContext, useState, ReactNode, Dispatch, SetStateAction } from 'react';
import type { PersonalInfo } from '@/lib/types';

// Define el tipo para el valor del contexto
interface UserContextType {
  personalInfo: PersonalInfo;
  setPersonalInfo: Dispatch<SetStateAction<PersonalInfo>>;
}

// Crea el contexto con un valor inicial undefined
export const UserContext = createContext<UserContextType | undefined>(undefined);

// Datos iniciales del usuario
const initialInfo: PersonalInfo = {
  firstName: 'John',
  lastName: 'Doe',
  sex: 'male',
  dateOfBirth: new Date('1985-05-20'),
  insuranceProvider: 'Isapre',
  isapreName: 'Colmena',
};

// Crea el proveedor del contexto
export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>(initialInfo);

  return (
    <UserContext.Provider value={{ personalInfo, setPersonalInfo }}>
      {children}
    </UserContext.Provider>
  );
};
