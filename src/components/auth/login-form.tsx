'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';


export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Forzar la obtención de un nuevo token
      const idToken = await userCredential.user.getIdToken(true);
      
      // Crear sesión con cookie httpOnly
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error('No se pudo establecer la sesión en el servidor.');
      }

      // Usar window.location.href en lugar de router.push para asegurar que 
      // el middleware procese la nueva cookie de sesión en la siguiente carga
      window.location.href = '/dashboard';
    } catch (error: any) {
      console.error(error);
      toast({
        variant: 'destructive',
        title: 'Error de Autenticación',
        description: 'Las credenciales no son válidas. Por favor, inténtalo de nuevo.',
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <Card className="w-full rounded-3xl border-border/70 bg-white shadow-card">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-extrabold text-brand-900">Bienvenido</CardTitle>
        <CardDescription>Ingresa tus credenciales para acceder a tu cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleLogin}>
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input id="email" name="email" type="email" placeholder="nombre@ejemplo.com" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className="h-12 rounded-xl" />
          </div>
          <Button type="submit" className="h-12 w-full rounded-full text-[15px] font-bold" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Iniciar Sesión
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        <p>
          ¿No tienes una cuenta?{' '}
          <Link href="/register" className="font-semibold text-primary underline-offset-4 hover:underline">
            Regístrate
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
