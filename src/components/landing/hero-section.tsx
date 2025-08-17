
'use client';
import Link from 'next/link';
import Image from 'next/image';

export default function HeroSection() {
  return (
    <section id="hero-section" className="bg-background pt-12 pb-12 text-center overflow-hidden w-full">
      {/* Container for the image */}
      <div className="relative w-full max-w-xl mx-auto aspect-[4/3] mb-8">
        <Image
          src="https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png"
          alt="MyHomeDoctorApp Logo"
          fill
          className="object-contain"
          // The "sizes" prop is added here to improve performance
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          data-ai-hint="app logo"
          priority
        />
      </div>

      {/* Container for the text content and button */}
      <div className="px-6">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-800 leading-tight mb-6">
          Tu Salud, Organizada y a tu Alcance.
        </h1>
        <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-3xl mx-auto">
          Gestiona tu historial médico y el de tu familia de forma segura y sencilla, desde la palma de tu mano.
        </p>
        <div className="mt-10 mb-12">
          <Link
            href="/login"
            className="bg-primary text-primary-foreground font-bold py-4 px-10 rounded-full shadow-lg hover:bg-primary/90 transform hover:scale-105 transition-all duration-300 ease-in-out text-lg"
          >
            Comenzar Ahora
          </Link>
        </div>
      </div>
    </section>
  );
}
