
'use client';
import Link from 'next/link';
import Image from 'next/image';

export default function HeroSection() {
  return (
    <section id="hero-section" className="bg-background pt-8 pb-12 text-center overflow-hidden w-full">
      {/* Logo con proporciones naturales y tamaño optimizado (40% más grande) */}
      <div className="relative w-full max-w-xl mx-auto aspect-[4/3]">
        <Image
                        src="https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png"
          alt="MyHomeDoctorApp Logo"
          fill
          className="object-contain"
          priority
        />
      </div>

      {/* Container for the text content and button */}
      <div className="px-6 -mt-6">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-800 leading-tight mb-4">
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
