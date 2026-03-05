import Link from 'next/link';
import { Stethoscope } from 'lucide-react';

export default function Header() {
  return (
    <header className="fixed top-0 w-full bg-white/95 backdrop-blur-md border-b border-gray-100 z-50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center h-16">
        <Link href="/landing" className="flex items-center gap-2 font-bold text-blue-950 no-underline">
          <Stethoscope className="h-7 w-7 text-emerald-600" />
          <span className="text-lg">MyHomeDoctorApp</span>
        </Link>
        <div className="flex gap-3">
          <Link
            href="/login"
            className="py-2.5 px-6 bg-gradient-to-br from-teal-600 to-teal-500 text-white rounded-lg font-semibold hover:opacity-90 transition text-sm sm:text-base"
          >
            Accede a MyHomeDoctorApp
          </Link>
        </div>
      </nav>
    </header>
  );
}
