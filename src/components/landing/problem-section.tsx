import { Brain, Heart, Lock } from 'lucide-react';

const features = [
  {
    icon: <Brain className="h-7 w-7 text-white" />,
    title: 'Triaje Inteligente con IA',
    description:
      'Análisis de síntomas basado en medicina basada en la evidencia. Te orienta sobre cuándo ir a urgencias, cuándo llamar al médico y cuándo esperar. Sin pánico, sin Google.',
  },
  {
    icon: <Heart className="h-7 w-7 text-white" />,
    title: 'Perfil Familiar Unificado',
    description:
      'Un espacio seguro para registrar la salud de toda tu familia: hijos, pareja, mayores. Historial completo en un lugar.',
  },
  {
    icon: <Lock className="h-7 w-7 text-white" />,
    title: 'Historial de Salud Seguro',
    description:
      'Encriptación de grado médico. Tus datos y los de tu familia están protegidos bajo los más altos estándares.',
  },
];

export default function ProblemSection() {
  return (
    <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-sky-100 to-teal-50">
      <div className="max-w-7xl mx-auto">
        <h2 className="font-serif text-4xl font-black text-center text-blue-950 mb-16">
          ¿Por Qué Confiar en MyHomeDoctorApp?
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div
              key={index}
              className="bg-white p-8 rounded-xl shadow-md hover:shadow-lg transition"
            >
              <div className="w-14 h-14 bg-gradient-to-br from-teal-400 to-teal-600 rounded-lg flex items-center justify-center mb-4">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-blue-950 mb-3">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
