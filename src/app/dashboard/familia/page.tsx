'use client';

import { EncabezadoPantalla } from '@/components/dashboard/encabezado-pantalla';
import { Familiograma } from '@/components/familia/familiograma';

export default function FamiliaPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 md:px-8 md:pt-8">
      <EncabezadoPantalla titulo="Mi familia" descripcion="Tu familiograma: cada persona con su información de salud." />
      <Familiograma />
    </div>
  );
}
