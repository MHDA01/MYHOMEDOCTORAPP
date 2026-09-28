import Link from 'next/link';
import { ArrowRight, Users } from 'lucide-react';

/**
 * Explica en el chat para qué sirve "Mi familia". Lo que dice es lo que la Dra. Hilda
 * realmente recibe de cada persona (nombre, edad, sexo, alergias y medicamentos, ver
 * PatientStructuredContext): si ese contexto cambia, este texto debe cambiar con él.
 */

/** Tarjeta de la pantalla de bienvenida del chat, antes de abrir una conversación. */
export function AvisoFamiliaBienvenida() {
  return (
    <aside className="w-full max-w-md rounded-2xl bg-sky-50 p-4 text-left">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-soft">
          <Users className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-brand-900">Consulta por cada persona de tu familia</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            La Dra. Hilda tiene en cuenta su edad, sexo, alergias y medicamentos. Manténlos al día en Mi familia.
          </p>
          <Link href="/dashboard/familia" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            Mi familia <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </aside>
  );
}

/** Nota corta al pie del selector "¿Para quién es esta consulta?". */
export function AvisoFamiliaSelector() {
  return (
    <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
      ¿Falta alguien o hay un dato por corregir?{' '}
      <Link href="/dashboard/familia" className="font-semibold text-primary hover:underline">
        Ve a Mi familia
      </Link>
      .
    </p>
  );
}
