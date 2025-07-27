import { FileArchive, ShieldCheck, Share2, CalendarCheck, Sparkles } from 'lucide-react';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: React.ReactNode;
  benefit: string;
}

function FeatureCard({ icon, title, description, benefit }: FeatureCardProps) {
  return (
    <div className="bg-white p-8 rounded-2xl shadow-lg flex flex-col md:flex-row items-start md:space-x-6 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
      <div className="flex-shrink-0 flex items-center justify-center w-16 h-16 bg-primary/10 text-primary rounded-2xl text-3xl mb-5 shadow-sm">
        {icon}
      </div>
      <div>
        <h3 className="text-2xl font-bold text-slate-800 mb-3">{title}</h3>
        <div className="text-slate-600 mb-4">{description}</div>
        <p className="font-semibold text-primary">{benefit}</p>
      </div>
    </div>
  );
}

export default function SolutionSection() {
  const features: FeatureCardProps[] = [
    {
      icon: <FileArchive className="h-8 w-8" />,
      title: 'Tu Expediente Médico Digital y Seguro',
      description: (
        <>
          <p>
            Centraliza y organiza todos tus documentos médicos (exámenes, recetas, diagnósticos) subiendo fotos o PDFs. ¡Olvídate del papeleo y ten todo a un clic!
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-accent-foreground/90">
            <Sparkles className="h-4 w-4 text-accent" />
            Nuestra IA puede resumir tus documentos para obtener información clave al instante.
          </p>
        </>
      ),
      benefit: 'Acceso inmediato y seguro a tu información donde la necesites.',
    },
    {
      icon: <ShieldCheck className="h-8 w-8" />,
      title: 'Información Vital Siempre Lista',
      description: 'Crea una ficha de salud con tus alergias, medicamentos actuales, condiciones crónicas y contactos de emergencia. Lista para ser mostrada en cualquier urgencia.',
      benefit: 'Paz mental y atención más rápida en momentos críticos.',
    },
    {
      icon: <Share2 className="h-8 w-8" />,
      title: 'Comparte Tu Historial, Tú Decides Cómo',
      description: 'Genera un PDF o enlace temporal con los documentos específicos que quieras compartir con un nuevo médico, con total control y privacidad.',
      benefit: 'Evita la repetición de exámenes y optimiza el tiempo en cada consulta.',
    },
    {
      icon: <CalendarCheck className="h-8 w-8" />,
      title: 'Nunca Más una Cita o Dosis Perdida',
      description: 'Registra manualmente tus próximas citas y recibe recordatorios automáticos. Configura alarmas para no olvidar la toma de tus medicamentos.',
      benefit: 'Mayor organización y adherencia a tus tratamientos.',
    },
  ];

  return (
    <section id="solution-section" className="py-16 md:py-24 bg-white">
      <div className="container mx-auto text-center px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">La Solución en tus Manos</h2>
        <p className="text-lg md:text-xl text-slate-600 mb-16 max-w-3xl mx-auto">
          My Home Doctor App te devuelve el poder sobre tu información de salud, de forma simple, segura e intuitiva.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 text-left">
          {features.map((feature, index) => (
            <FeatureCard key={index} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
}