import { cn } from '@/lib/utils';
import type { SexoFamiliar } from '@/lib/familia';

/**
 * Símbolo de un familiograma: cuadrado = hombre, círculo = mujer, rombo = otro.
 * La edad va dentro; una cruz lo tacha si la persona falleció; el doble borde
 * marca a la persona índice (el titular de la cuenta).
 */
export function SimboloFamiliograma({
  sexo,
  edad,
  fallecido = false,
  titular = false,
  className,
}: {
  sexo: SexoFamiliar;
  edad?: number;
  fallecido?: boolean;
  titular?: boolean;
  className?: string;
}) {
  const relleno = fallecido ? 'fill-slate-100' : titular ? 'fill-sky-100' : 'fill-white';
  const trazo = 'stroke-brand-800';

  const forma = (inset: number, key: string) => {
    const lado = 40 - inset * 2;
    if (sexo === 'male') {
      return <rect key={key} x={inset} y={inset} width={lado} height={lado} rx={3} className={cn(relleno, trazo)} strokeWidth={2} />;
    }
    if (sexo === 'female') {
      return <circle key={key} cx={20} cy={20} r={20 - inset} className={cn(relleno, trazo)} strokeWidth={2} />;
    }
    const r = 20 - inset;
    return (
      <polygon
        key={key}
        points={`20,${20 - r} ${20 + r},20 20,${20 + r} ${20 - r},20`}
        className={cn(relleno, trazo)}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    );
  };

  const etiqueta = `${sexo === 'male' ? 'Hombre' : sexo === 'female' ? 'Mujer' : 'Otro'}${edad !== undefined ? `, ${edad} años` : ''}${fallecido ? ', fallecido/a' : ''}`;

  return (
    <svg viewBox="0 0 40 40" className={cn('h-12 w-12 shrink-0', className)} role="img" aria-label={etiqueta}>
      {forma(2, 'externa')}
      {titular && forma(6, 'interna')}
      {edad !== undefined && (
        <text x={20} y={20} textAnchor="middle" dominantBaseline="central" className="fill-brand-900 text-[13px] font-bold">
          {edad}
        </text>
      )}
      {fallecido && (
        <g className="stroke-brand-900" strokeWidth={2} strokeLinecap="round">
          <line x1={2} y1={2} x2={38} y2={38} />
          <line x1={38} y1={2} x2={2} y2={38} />
        </g>
      )}
    </svg>
  );
}
