import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Image 
      src="https://i.postimg.cc/1X7bYj9g/LOGO-TRANSPARENTE.png" 
      alt="MyHomeDoctorApp Logo" 
      width={200} 
      height={150} 
      className={className}
      data-ai-hint="app logo"
      priority
    />
  );
}
