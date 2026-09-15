import { RegisterForm } from '@/components/auth/register-form';
import { PantallaAcceso } from '@/components/auth/pantalla-acceso';

export default function RegisterPage() {
  return (
    <PantallaAcceso>
      <RegisterForm />
    </PantallaAcceso>
  );
}
