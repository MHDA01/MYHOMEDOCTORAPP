'use client';

import { useState } from 'react';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import type { FamilyProfile } from '@/lib/types';
import { calcularEdad, nombrePropio, SEGURIDAD_SOCIAL } from '@/lib/familia';
import { cn } from '@/lib/utils';
import { SimboloFamiliograma } from './simbolo-familiograma';

const SEXO: Record<string, string> = { male: 'Hombre', female: 'Mujer', other: 'Otro' };

function fechaLegible(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * Tarjeta de una persona del familiograma. A simple vista solo lo esencial: quién es, su edad
 * y sus alergias (por seguridad). El resto de lo que guarda la app está en la ficha, que se abre
 * al tocarla, y solo muestra lo que tiene datos.
 */
export function TarjetaIntegrante({
  persona,
  onEditar,
  onEliminar,
}: {
  persona: FamilyProfile;
  onEditar: (persona: FamilyProfile) => void;
  onEliminar: (persona: FamilyProfile) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const titular = Boolean(persona.esTitular);
  const fallecido = Boolean(persona.deceased);
  const nombre = nombrePropio(`${persona.firstName} ${persona.lastName}`.trim()) || 'Sin nombre';
  // La edad de quien ya falleció no se calcula: sería la que tendría hoy, no la que tuvo.
  const edad = fallecido ? undefined : calcularEdad(persona.dateOfBirth) ?? persona.age;
  const anioNacimiento = /^\d{4}/.exec(persona.dateOfBirth)?.[0];

  const resumen = [
    SEXO[persona.sex],
    fallecido ? (anioNacimiento ? `nació en ${anioNacimiento}` : '') : edad !== undefined ? `${edad} años` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const etiquetaSeguridad = SEGURIDAD_SOCIAL[persona.country ?? 'colombia']?.etiqueta ?? 'Seguridad social';
  const datos: [string, string][] = (
    [
      ['Nació', fechaLegible(persona.dateOfBirth)],
      ['Peso', persona.weight ? `${persona.weight} kg` : ''],
      [etiquetaSeguridad, [persona.insuranceProvider, persona.insuranceProviderName].filter(Boolean).join(' · ')],
    ] as [string, string][]
  ).filter(([, valor]) => valor);

  const antecedentes = [
    ['Patológicos', persona.pathologicalHistory],
    ['Quirúrgicos', persona.surgicalHistory],
    ['Ginecológicos', persona.sex === 'female' ? persona.gynecologicalHistory : ''],
    ['Familiares', titular ? '' : persona.familyHistory],
  ].filter((par): par is [string, string] => Boolean(par[1]));

  const medicamentos = persona.medications ?? [];
  const hayFicha = datos.length > 0 || medicamentos.length > 0 || antecedentes.length > 0;

  return (
    <article
      className={cn(
        'w-full rounded-2xl bg-white p-4 text-left shadow-soft sm:w-[260px]',
        titular ? 'ring-2 ring-primary/40' : 'ring-1 ring-border/70',
        fallecido && 'bg-slate-50'
      )}
      aria-label={`${nombre}, ${titular ? 'titular' : persona.relationship}`}
    >
      <header className="flex items-start gap-3">
        <SimboloFamiliograma sexo={persona.sex} edad={edad} fallecido={fallecido} titular={titular} />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-[15px] font-bold leading-snug text-brand-900">{nombre}</h3>
          <p className="text-xs font-semibold text-primary">{titular ? 'Tú' : persona.relationship}</p>
          {resumen && <p className="mt-0.5 text-xs text-muted-foreground">{resumen}</p>}
        </div>
        <div className="-mr-1.5 -mt-1.5 flex shrink-0">
          <button
            type="button"
            onClick={() => onEditar(persona)}
            aria-label={`Editar a ${nombre}`}
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-sky-50 hover:text-brand-900"
          >
            <Pencil className="h-4 w-4" />
          </button>
          {!titular && (
            <button
              type="button"
              onClick={() => onEliminar(persona)}
              aria-label={`Eliminar a ${nombre}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      {fallecido && <p className="mt-2 text-xs font-semibold text-slate-500">Fallecido/a</p>}

      {persona.allergies?.length ? (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Alergias">
          {persona.allergies.map((a) => (
            <li key={a} className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-800">
              Alergia: {a}
            </li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="mt-3 flex w-full items-center justify-between border-t border-border/60 pt-3 text-sm font-semibold text-brand-800 hover:text-primary"
      >
        {abierta ? 'Ocultar ficha' : 'Ver ficha'}
        <ChevronDown className={cn('h-4 w-4 transition-transform', abierta && 'rotate-180')} />
      </button>

      {abierta && (
        <div className="mt-3 space-y-3 text-[13px]">
          {hayFicha ? (
            <>
              {datos.length > 0 && (
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                  {datos.map(([etiqueta, valor]) => (
                    <div key={etiqueta} className="contents">
                      <dt className="text-muted-foreground">{etiqueta}</dt>
                      <dd className="min-w-0 break-words font-medium text-brand-900">{valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {medicamentos.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground">Medicamentos</h4>
                  <p className="mt-0.5 break-words text-brand-900">{medicamentos.join(', ')}</p>
                </div>
              )}
              {antecedentes.map(([titulo, texto]) => (
                <div key={titulo}>
                  <h4 className="text-xs font-semibold text-muted-foreground">{titulo}</h4>
                  <p className="mt-0.5 whitespace-pre-line break-words text-brand-900">{texto}</p>
                </div>
              ))}
            </>
          ) : (
            <p className="text-muted-foreground">Aún no hay más datos. Agrégalos con el lápiz.</p>
          )}
        </div>
      )}
    </article>
  );
}
