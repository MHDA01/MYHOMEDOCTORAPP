import Image from 'next/image';
import Link from 'next/link';

export default function HeroSection() {
  return (
    <>
      {/* Logo Banner */}
      <section className="pt-20 pb-8 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto flex justify-center">
          <Image
            src="https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png"
            alt="MyHomeDoctorApp Logo"
            width={384}
            height={384}
            className="w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 object-contain drop-shadow-lg"
            priority
          />
        </div>
      </section>

      {/* Hero Content */}
      <section className="pt-4 pb-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col justify-center">
            <h1 className="font-serif text-5xl lg:text-6xl font-black text-blue-950 mb-6" style={{ lineHeight: 1.3 }}>
              Tu Familia protegida por Médicos Expertos e Inteligencia Artificial.
            </h1>

            <p className="text-xl text-gray-600 mb-8 leading-relaxed font-light">
              Deja de adivinar con Google. MyHomeDoctorApp te ofrece orientación médica basada en evidencia científica actualizada y auditada por médicos expertos para gestionar la salud de tu núcleo familiar. Creada por médicos, diseñada para tu hogar.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/login"
                className="py-3 px-8 bg-gradient-to-br from-teal-600 to-teal-500 text-white rounded-lg text-center text-lg font-semibold hover:opacity-90 transition"
              >
                Accede a MyHomeDoctorApp
              </Link>
            </div>

            {/* Trust Indicators */}
            <div className="mt-6 pt-4 border-t border-gray-200 flex gap-8 flex-wrap">
              <div>
                <div className="text-3xl font-bold text-emerald-600">100%</div>
                <p className="text-gray-600 text-sm">Seguridad Encriptada</p>
              </div>
              <div>
                <div className="text-3xl font-bold text-blue-950">Real</div>
                <p className="text-gray-600 text-sm">Expertise Médico</p>
              </div>
              <div>
                <div className="text-3xl font-bold text-emerald-600">24/7</div>
                <p className="text-gray-600 text-sm">Disponibilidad</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
