import { Lock } from 'lucide-react';

export default function SecuritySection() {
  return (
    <section id="security-section" className="py-16 md:py-24 bg-slate-800 text-white">
      <div className="container mx-auto text-center px-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex justify-center mb-6">
            <div className="flex items-center justify-center w-20 h-20 bg-accent/20 text-accent rounded-full text-4xl">
              <Lock className="h-10 w-10" />
            </div>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Tu Seguridad y Privacidad son Nuestra Prioridad</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-lg">
            <div className="text-center md:text-right border-b-2 md:border-b-0 md:border-r-2 border-slate-700 pb-6 md:pb-0 md:pr-8">
              <h3 className="text-xl font-bold mb-2 text-accent">Control Total para Ti</h3>
              <p className="text-slate-300">
                Tú tienes el control absoluto sobre tu información. Decide qué subes y con quién lo compartes. Nada se comparte sin tu permiso.
              </p>
            </div>
            <div className="text-center md:text-left pt-6 md:pt-0 md:pl-8">
              <h3 className="text-xl font-bold mb-2 text-accent">Datos Protegidos</h3>
              <p className="text-slate-300">
                Implementamos medidas de seguridad avanzadas para garantizar la confidencialidad y protección de tus datos médicos sensibles.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
