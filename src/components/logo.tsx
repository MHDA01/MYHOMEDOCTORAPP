import Image from 'next/image';
import { cn } from '@/lib/utils';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      <Image 
        src="https://storage.googleapis.com/monorepo-prod-project-resources/465d6830-1bfa-4458-8926-b07283626a57/my-home-doctor-logo.png" 
        alt="MyHome DoctorApp Logo" 
        width={200} 
        height={150} 
        data-ai-hint="app logo"
      />
    </div>
  );
}
