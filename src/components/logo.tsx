import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <Image 
      src="https://i.postimg.cc/J7N5r89y/LOGO-1.png" 
      alt="MiDoctorDeCasaApp Logo" 
      width={200} 
      height={150} 
      className={className}
      data-ai-hint="app logo"
      priority
    />
  );
}
