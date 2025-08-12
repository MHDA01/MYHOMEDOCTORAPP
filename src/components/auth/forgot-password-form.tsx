'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';

export function ForgotPasswordForm() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSent, setIsSent] = useState(false);

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: 'Correo Enviado',
        description: 'Se ha enviado un enlace a tu correo para restablecer la contraseña.',
      });
      setIsSent(true);
    } catch (error: any) {
      console.error(error);
      let description = 'Ocurrió un error. Por favor, inténtalo de nuevo.';
      if (error.code === 'auth/user-not-found') {
        description = 'El correo electrónico no se encuentra registrado.';
      }
      toast({
        variant: 'destructive',
        title: 'Error',
        description: description,
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isSent) {
    return (
        <Card className="w-full">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl font-headline">Revisa tu Correo</CardTitle>
                <CardDescription>
                Hemos enviado un correo a <strong>{email}</strong> con las instrucciones para recuperar tu contraseña.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Link href="/login">
                    <Button variant="outline" className="w-full">
                        <ArrowLeft className="mr-2 h-4 w-4" />
                        Volver a Iniciar Sesión
                    </Button>
                </Link>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-headline">Recuperar Contraseña</CardTitle>
        <CardDescription>Ingresa tu correo electrónico y te enviaremos un enlace para recuperarla.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleResetPassword}>
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input id="email" type="email" placeholder="nombre@ejemplo.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Correo de Recuperación
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline flex items-center">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver a Iniciar Sesión
        </Link>
      </CardFooter>
    </Card>
  );
}
