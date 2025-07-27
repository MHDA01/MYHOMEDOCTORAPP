import { Facebook, Instagram } from 'lucide-react';
import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-10 text-center">
      <div className="container mx-auto px-6">
        <div className="flex justify-center items-center space-x-4 mb-6">
          <Link href="#" className="hover:text-white transition-colors duration-200">
            Aviso de Privacidad
          </Link>
          <span className="text-slate-500">&bull;</span>
          <Link href="#" className="hover:text-white transition-colors duration-200">
            Términos y Condiciones
          </Link>
        </div>
        <div className="flex justify-center space-x-6 mb-6">
          <a href="#" aria-label="Facebook" className="text-slate-400 hover:text-white transition-colors duration-200 text-xl">
            <Facebook className="h-5 w-5" />
          </a>
          <a href="#" aria-label="Instagram" className="text-slate-400 hover:text-white transition-colors duration-200 text-xl">
            <Instagram className="h-5 w-5" />
          </a>
        </div>
        <p className="text-sm">&copy; 2025 My Home Doctor App. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}
