import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <section id="hero-section" className="bg-white pt-16 pb-12 md:pt-24 md:pb-16 text-center overflow-hidden">
      <div className="container mx-auto px-6">
        <div className="flex justify-center mb-8">
          <Image
            src="https://i.postimg.cc/J7N5r89y/LOGO-1.png"
            alt="Logo de My Home Doctor App con una doctora sonriente"
            width={800}
            height={600}
            className="max-w-md md:max-w-lg lg:max-w-xl h-auto"
            data-ai-hint="app logo"
            priority
          />
        </div>
        <div className="relative z-10">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-800 leading-tight mb-6">
            Tu Expediente Médico Digital, <br className="hidden md:block" /> <span className="text-primary">Control Total en tus Manos.</span>
            </h1>
            <p className="text-lg md:text-xl text-slate-600 mb-10 max-w-3xl mx-auto">
            Gestiona tu historial de salud y el de tu familia desde la palma de tu mano, de forma segura y sencilla.
            </p>
            <div className="mt-10 mb-12">
              <Link
                href="/login"
                className="bg-primary text-primary-foreground font-bold py-4 px-10 rounded-full shadow-lg hover:bg-primary/90 transform hover:scale-105 transition-all duration-300 ease-in-out text-lg"
              >
                Ir a la App
              </Link>
            </div>
        </div>
      </div>
    </section>
  );
}
