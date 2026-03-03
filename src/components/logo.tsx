import Image from 'next/image';

export function Logo({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center px-2 py-1 ${className ?? ''}`}>
      <Image 
        src="https://i.postimg.cc/J7N5r89y/LOGO-1.png" 
        alt="MiDoctorDeCasaApp Logo" 
        width={200} 
        height={150} 
        className="w-full h-auto object-contain scale-[1.15] origin-center"
        data-ai-hint="app logo"
        priority
      />
    </div>
  );
}
