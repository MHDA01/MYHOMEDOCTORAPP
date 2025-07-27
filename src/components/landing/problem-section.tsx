import { FolderOpen, Clock, Siren, FileQuestion } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const problems = [
  {
    icon: <FolderOpen className="h-8 w-8" />,
    text: '¿Andar con una bolsa de exámenes de todo tipo para intentar reconstruir tu historial?',
  },
  {
    icon: <Clock className="h-8 w-8" />,
    text: '¿Olvidaste tus citas médicas importantes o cuándo tomar tus medicamentos?',
  },
  {
    icon: <Siren className="h-8 w-8" />,
    text: '¿Necesitas tu historial médico en una emergencia y no lo tienes a mano?',
  },
  {
    icon: <FileQuestion className="h-8 w-8" />,
    text: '¿Repetir exámenes y trámites por no tener tu información médica centralizada?',
  },
];

export default function ProblemSection() {
  return (
    <section id="problem-section" className="py-16 md:py-24 bg-secondary pt-36 md:pt-40">
      <div className="container mx-auto text-center px-6">
        <h2 className="text-3xl md:text-4xl font-bold text-slate-800 mb-4">¿Te identificas con esto?</h2>
        <p className="text-lg text-slate-600 mb-12">Las frustraciones más comunes en la gestión de tu salud.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {problems.map((problem, index) => (
            <Card key={index} className="bg-white p-6 flex flex-col items-center text-center hover:shadow-xl transition-shadow duration-300 border-0 rounded-xl">
              <CardContent className="p-0 flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-primary/10 text-primary rounded-2xl text-3xl mb-5 shadow-sm">
                  {problem.icon}
                </div>
                <p className="font-medium text-slate-700">{problem.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
