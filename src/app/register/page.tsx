import { RegisterForm } from '@/components/auth/register-form';
import { Logo } from '@/components/logo';

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo />
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
