
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { signInWithEmailAndPassword, signInAnonymously } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGuestLoading, setIsGuestLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error de Autenticación",
        description: "Las credenciales no son válidas. Por favor, inténtalo de nuevo.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    setIsGuestLoading(true);
    try {
      await signInAnonymously(auth);
      router.push("/dashboard");
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo iniciar sesión como invitado. Inténtalo de nuevo.",
      });
    } finally {
      setIsGuestLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-xl shadow p-8 space-y-6">
      <div className="flex flex-col items-center">
        <div className="mb-4">
          <img src="https://res.cloudinary.com/dm9gwvsmq/image/upload/v1755545822/LOGO_1_transparent_wsag9b.png" alt="Logo" className="h-80 mx-auto mb-[-16px]" />
        </div>
        <h2 className="text-2xl font-bold mb-2">Bienvenido</h2>
        <p className="text-gray-500 text-center mb-4 text-sm">
          Ingresa tus credenciales para acceder a tu cuenta.
        </p>
      </div>
      <form className="space-y-4" onSubmit={handleLogin} autoComplete="on">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            Correo Electrónico
          </label>
          <Input
            id="email"
            type="email"
            placeholder="nombre@ejemplo.com"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <Link href="/forgot-password" className="text-xs text-blue-500 hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Iniciar Sesión
        </Button>
      </form>
      <div className="flex items-center my-2">
        <div className="flex-1 h-px bg-gray-200" />
        <span className="mx-2 text-xs text-gray-400">o</span>
        <div className="flex-1 h-px bg-gray-200" />
      </div>
      <Button
        variant="outline"
        className="w-full"
        onClick={handleGuestLogin}
        disabled={isGuestLoading}
      >
        {isGuestLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Iniciar Sesión como Invitado
      </Button>
      <div className="text-center text-sm mt-4">
        ¿No tienes una cuenta?{' '}
        <Link href="/register" className="text-blue-500 font-semibold hover:underline">
          Regístrate
        </Link>
      </div>
    </div>
  );
}
