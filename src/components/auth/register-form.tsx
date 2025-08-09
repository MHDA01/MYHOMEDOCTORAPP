'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';

export function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Las contraseñas no coinciden',
      });
      return;
    }
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });
      
      const [firstName, ...lastNameParts] = name.split(' ');
      const lastName = lastNameParts.join(' ');

      // Create a default profile document in Firestore
      const initialProfile = {
        personalInfo: {
          firstName: firstName || '',
          lastName: lastName || '',
          sex: 'other',
          dateOfBirth: new Date(),
          country: 'chile',
          insuranceProvider: 'Fonasa',
          insuranceProviderName: '',
        },
        healthInfo: {
            allergies: [],
            medications: [],
            pathologicalHistory: '',
            surgicalHistory: '',
            gynecologicalHistory: '',
            emergencyContacts: [],
        },
      };

      await setDoc(doc(db, 'users', user.uid), initialProfile);

      router.push('/dashboard');
    } catch (error: any) {
      console.error(error);
       toast({
        variant: 'destructive',
        title: 'Error de Registro',
        description: error.message,
      });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-headline">Crear una Cuenta</CardTitle>
        <CardDescription>Completa los siguientes datos para comenzar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleRegister}>
          <div className="space-y-2">
            <Label htmlFor="name">Nombre Completo</Label>
            <Input id="name" type="text" placeholder="John Doe" required value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input id="email" type="email" placeholder="nombre@ejemplo.com" required value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
            <Input id="confirm-password" type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrarse
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <p>
          ¿Ya tienes una cuenta?{' '}
          <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
            Iniciar Sesión
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
