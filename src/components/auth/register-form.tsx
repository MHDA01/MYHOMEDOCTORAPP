'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useHidratado } from '@/hooks/use-hidratado';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from 'lucide-react';
import { COLECCION_TUTOR, SUBCOLECCION_INTEGRANTES } from '@/lib/constants';
import { LegalConsentModal } from './legal-consent-modal';
import { registrarRegistroOrigen } from '@/app/actions/origen';
import { CLAVE_ORIGEN, origenVigente } from '@/lib/origen';

/**
 * Selector nativo, igual que en el formulario de integrantes: el desplegable de
 * Radix no está en este árbol de componentes y en el celular el del sistema es
 * más cómodo.
 */
const CLASE_SELECT =
  'h-12 w-full rounded-xl border border-input bg-white px-3 text-[15px] text-brand-900 focus:outline-none focus:ring-2 focus:ring-ring';

/** Hoy en texto AAAA-MM-DD, para que nadie nazca en el futuro. */
function hoyEnTexto(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
}

/** Si la persona llegó desde una red en los últimos 30 días, suma el registro a esa red. */
async function atribuirRegistro(idToken: string) {
  try {
    const fuente = origenVigente(localStorage.getItem(CLAVE_ORIGEN), Date.now());
    if (!fuente) return;
    await registrarRegistroOrigen(idToken, fuente);
    localStorage.removeItem(CLAVE_ORIGEN);
  } catch {
    // Contar el origen nunca debe impedir el registro.
  }
}

export function RegisterForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState('');
  // Sin valor por defecto a propósito: la edad y el sexo son los dos
  // estratificadores de toda la orientación, y ninguno se infiere. Hasta el
  // 8-nov-2026 el formulario no los preguntaba y guardaba un sexo fijo más la
  // fecha del día, o sea un sexo inventado y una edad de cero.
  // Ver tests/unidad/registro-pide-edad-y-sexo.test.ts.
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [sex, setSex] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const hidratado = useHidratado();

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({
        variant: 'destructive',
        title: 'Las contraseñas no coinciden',
      });
      return;
    }
    // El navegador ya exige los dos campos; esto es la red por si alguien
    // envía el formulario sin pasar por él. Mejor no crear la cuenta que
    // crearla con los dos datos inventados, que es lo que pasaba antes.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth) || dateOfBirth > hoyEnTexto() || !sex) {
      toast({
        variant: 'destructive',
        title: 'Faltan la fecha de nacimiento y el sexo',
        description: 'Los necesitamos para orientarte bien: la edad y el sexo cambian lo que hay que revisar.',
      });
      return;
    }
    setShowConsent(true);
  };

  const handleConsentAccepted = async () => {
    setShowConsent(false);
    setIsLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await updateProfile(user, { displayName: name });
      
      const [firstName, ...lastNameParts] = name.split(' ');
      const lastName = lastNameParts.join(' ');

      // Crear perfil inicial del usuario (Tutor)
      const initialProfile = {
        personalInfo: {
          firstName: firstName || '',
          lastName: lastName || '',
          sex,
          // Mediodía UTC, igual que `saveTitularProfile` en actions/family.ts:
          // así el día no se corre al pasar por una zona horaria.
          dateOfBirth: new Date(`${dateOfBirth}T12:00:00.000Z`),
          country: 'colombia',
          insuranceProvider: '',
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
        legalConsent: {
          dataProtection: true,
          teleorientationDisclaimer: true,
          termsAndConditions: true,
          consentVersion: '1.0',
          acceptedAt: serverTimestamp(),
        },
      };

      await setDoc(doc(db, COLECCION_TUTOR, user.uid), initialProfile);

      // Crear integrante titular coincidente
      const titularProfile = {
        userId: user.uid,
        firstName: firstName || '',
        lastName: lastName || '',
        sex,
        // En el integrante la fecha va como texto AAAA-MM-DD, nunca ISO con
        // hora: es la regla de la casa y lo que espera `fechaGuardada`.
        dateOfBirth,
        relationship: 'Titular',
        esTitular: true,
        allergies: [],
        medications: [],
        hasHistory: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(
        doc(db, COLECCION_TUTOR, user.uid, SUBCOLECCION_INTEGRANTES, 'titular'),
        titularProfile,
        { merge: true }
      );

      // El documento de tokens ya NO se crea desde aquí: el saldo es lo único
      // que decide si una consulta se cobra, así que el navegador no puede
      // escribirlo (las reglas lo niegan desde el paso 5 de la auditoría). Lo
      // crea el servidor en el primer acceso, con los mismos valores, en
      // ensureTokenDocument (src/lib/token-system.ts).

      // Forzar la obtención de un nuevo token y crear sesión
      const idToken = await user.getIdToken(true);
      const response = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error('No se pudo establecer la sesión en el servidor.');
      }

      await atribuirRegistro(idToken);

      // Usar window.location.href en lugar de router.push para asegurar que 
      // el middleware procese la nueva cookie de sesión en la siguiente carga
      window.location.href = '/dashboard';
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
    <>
      <Card className="w-full rounded-3xl border-border/70 bg-white shadow-card">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-extrabold text-brand-900">Crear una Cuenta</CardTitle>
          <CardDescription>Completa los siguientes datos para comenzar.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Igual que en el login: el botón no existe habilitado hasta que
              React hidrate, y method="post" evita que un envío nativo ponga la
              contraseña en la URL. */}
          <form className="space-y-4" method="post" onSubmit={handleFormSubmit}>
            <div className="space-y-2">
              <Label htmlFor="name">Nombre Completo</Label>
              <Input id="name" name="name" type="text" placeholder="Nombre y apellido" required value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="h-12 rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="register-dob">Fecha de nacimiento</Label>
                <Input
                  id="register-dob"
                  name="dateOfBirth"
                  type="date"
                  required
                  min="1900-01-01"
                  max={hoyEnTexto()}
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  autoComplete="bday"
                  className="h-12 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="register-sex">Sexo</Label>
                <select
                  id="register-sex"
                  name="sex"
                  required
                  value={sex}
                  onChange={(e) => setSex(e.target.value)}
                  className={CLASE_SELECT}
                >
                  <option value="">Selecciona…</option>
                  <option value="female">Mujer</option>
                  <option value="male">Hombre</option>
                  <option value="other">Otro</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              La edad y el sexo cambian lo que hay que revisar, así que los necesitamos desde el principio.
            </p>
            <div className="space-y-2">
              <Label htmlFor="register-email">Correo Electrónico</Label>
              <Input id="register-email" name="email" type="email" placeholder="nombre@ejemplo.com" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" className="h-12 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">Contraseña</Label>
              <Input id="register-password" name="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" className="h-12 rounded-xl" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Contraseña</Label>
              <Input id="confirm-password" name="confirm-password" type="password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" className="h-12 rounded-xl" />
            </div>
            <Button type="submit" className="h-12 w-full rounded-full text-[15px] font-bold" disabled={isLoading || !hidratado}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Registrarse
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center text-sm text-muted-foreground">
          <p>
            ¿Ya tienes una cuenta?{' '}
            <Link href="/login" className="font-semibold text-primary underline-offset-4 hover:underline">
              Iniciar Sesión
            </Link>
          </p>
        </CardFooter>
      </Card>

      <LegalConsentModal
        open={showConsent}
        onAccept={handleConsentAccepted}
      />
    </>
  );
}
