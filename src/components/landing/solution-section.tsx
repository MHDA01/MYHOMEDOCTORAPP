import Link from 'next/link';

export default function SolutionSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
      <div className="max-w-4xl mx-auto text-center">
        <h2 className="font-serif text-4xl font-black text-blue-950 mb-4">
          ¿Listo para cuidar a tu familia con confianza?
        </h2>
        <p className="text-xl text-gray-600 mb-8">
          Miles de familias ya usan MyHomeDoctorApp para tomar mejores decisiones sobre la salud de sus hijos y seres queridos.
        </p>
        <Link
          href="/login"
          className="py-3 px-10 bg-gradient-to-br from-teal-600 to-teal-500 text-white rounded-lg text-lg font-semibold hover:opacity-90 transition inline-block"
        >
          Accede a MyHomeDoctorApp
        </Link>
      </div>
    </section>
  );
}
