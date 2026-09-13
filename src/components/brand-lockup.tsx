import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Logo horizontal para barras estrechas (cabecera del celular, página de
 * entrada): la casa del logo de MyHomeDoctorApp más el nombre en texto.
 *
 * `logo-icono.png` es un recorte del mismo LOGO_1_transparent.png, sin redibujar
 * nada. Los colores del nombre siguen los del logo: "MyHome" gris oscuro,
 * "DoctorApp" azul.
 *
 * Tamaños generosos a propósito: la doctora dentro de la casa es la imagen de
 * la app y a 32-40 px ya no se reconocía.
 */
const SIZES = {
  md: { icon: 'h-14 w-14', text: 'text-[19px]' },
  lg: { icon: 'h-14 w-14 sm:h-[76px] sm:w-[76px]', text: 'text-[19px] sm:text-[26px]' },
} as const;

export function BrandLockup({ className, size = 'md' }: { className?: string; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Image src="/images/logo-icono.png" alt="" width={76} height={76} priority className={cn('shrink-0', s.icon)} />
      <span className={cn('flex flex-col font-headline font-extrabold leading-[1.02] tracking-tight', s.text)}>
        <span className="text-foreground/80">MyHome</span>
        <span className="text-brand-700">DoctorApp</span>
      </span>
    </span>
  );
}

/**
 * Logo completo (casa con la doctora arriba, nombre abajo), sin los márgenes
 * transparentes del PNG original. Para los menús laterales, donde hay espacio
 * para mostrar la imagen de la app tal cual es.
 */
export function LogoCompleto({ className }: { className?: string }) {
  return (
    <Image
      src="/images/logo-completo.png"
      alt="MyHomeDoctorApp"
      width={409}
      height={440}
      priority
      className={cn('h-36 w-auto', className)}
    />
  );
}
