'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function RegisterForm() {
  const router = useRouter();

  const handleRegister = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    router.push('/dashboard');
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-headline">Crear una Cuenta</CardTitle>
        <CardDescription>Completa los siguientes datos para comenzar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nombre Completo</Label>
            <Input id="name" type="text" placeholder="John Doe" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Correo Electrónico</Label>
            <Input id="email" type="email" placeholder="nombre@ejemplo.com" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Contraseña</Label>
            <Input id="password" type="password" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
            <Input id="confirm-password" type="password" required />
          </div>
          <Button type="submit" className="w-full" onClick={handleRegister}>
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
