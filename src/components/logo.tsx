import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Image 
      src="https://i.postimg.cc/k47gJg3B/LOGO-WHITE.png" 
      alt="MyHomeDoctorApp Logo" 
      width={200} 
      height={150} 
      className={className}
      data-ai-hint="app logo"
      priority
    />
  );
}
