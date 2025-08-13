import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Image 
      src="https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png" 
      alt="MyHomeDoctorApp Logo" 
      width={160} 
      height={120} 
      className={className}
      data-ai-hint="app logo"
      priority
    />
  );
}
