import { LoginForm } from '@/components/auth/login-form';
import { PantallaAcceso } from '@/components/auth/pantalla-acceso';

export default function LoginPage() {
  return (
    <PantallaAcceso>
      <LoginForm />
    </PantallaAcceso>
  );
}
