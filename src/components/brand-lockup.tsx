import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Logo horizontal para cabeceras: la casa del logo de MyHomeDoctorApp más el
 * nombre compuesto en texto. El logo original es cuadrado (casa arriba, nombre
 * abajo) y en una cabecera ocupaba casi 150 px de alto.
 *
 * `logo-icono.png` es un recorte del mismo LOGO_1_transparent.png, sin redibujar
 * nada. Los colores del nombre siguen los del logo: "MyHome" gris oscuro,
 * "DoctorApp" azul.
 */
export function BrandLockup({ className, size = 'md' }: { className?: string; size?: 'sm' | 'md' }) {
  const icon = size === 'sm' ? 32 : 40;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image src="/images/logo-icono.png" alt="" width={icon} height={icon} priority className="shrink-0" />
      <span
        className={cn(
          'flex flex-col font-headline font-extrabold leading-[0.95] tracking-tight',
          size === 'sm' ? 'text-[13px]' : 'text-[15px]'
        )}
      >
        <span className="text-foreground/80">MyHome</span>
        <span className="text-brand-700">DoctorApp</span>
      </span>
    </span>
  );
}
