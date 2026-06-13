import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center px-2 pt-2 pb-1 ${className ?? ''}`}>
      <Image
        src="/images/LOGO_1_transparent.png"
        alt="MiDoctorDeCasaApp Logo"
        width={220}
        height={220}
        className="h-auto w-full object-contain"
        data-ai-hint="app logo"
        priority
      />
    </div>
  );
}
