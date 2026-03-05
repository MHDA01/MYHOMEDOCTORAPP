import { Stethoscope, Mail, Phone } from 'lucide-react';
import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-blue-950 text-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Stethoscope className="h-7 w-7 text-emerald-400" />
              <span className="font-bold text-lg">MyHomeDoctorApp</span>
            </div>
            <p className="text-gray-300">
              Gestión médica inteligente, creada por un médico, para el bienestar de tu familia.
            </p>
          </div>

          {/* Producto */}
          <div>
            <h4 className="font-bold mb-4">Producto</h4>
            <ul className="space-y-2 text-gray-300">
              <li><Link href="#" className="hover:text-emerald-400 transition">Características</Link></li>
              <li><Link href="#" className="hover:text-emerald-400 transition">Precios</Link></li>
              <li><Link href="#" className="hover:text-emerald-400 transition">Seguridad</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-bold mb-4">Legal</h4>
            <ul className="space-y-2 text-gray-300">
              <li><Link href="#" className="hover:text-emerald-400 transition">Privacidad</Link></li>
              <li><Link href="#" className="hover:text-emerald-400 transition">Términos</Link></li>
              <li><Link href="#" className="hover:text-emerald-400 transition">Cookies</Link></li>
            </ul>
          </div>

          {/* Contacto */}
          <div>
            <h4 className="font-bold mb-4">Contacto</h4>
            <p className="text-gray-300 mb-2 flex items-center gap-2">
              <Mail className="h-4 w-4" /> info@myhomedoctorapp.com
            </p>
            <p className="text-gray-300 flex items-center gap-2">
              <Phone className="h-4 w-4" /> +1 (555) 123-4567
            </p>
          </div>
        </div>

        <div className="border-t border-blue-800 pt-8 text-center text-gray-400">
          <p>&copy; 2026 MyHomeDoctorApp. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
