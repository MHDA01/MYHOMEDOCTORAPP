import Link from 'next/link';
import { BrandLockup } from '@/components/brand-lockup';
import { ACCESO_LIBRE } from '@/config/acceso';

/**
 * Marco de las pantallas de ingreso y registro, con la identidad de la página de
 * entrada: fondo cielo, logo y, en computador, el mensaje principal a la izquierda.
 * Los textos son los que ya existían en la página de entrada.
 */
export function PantallaAcceso({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-sky-100 via-sky-50 to-white text-foreground">
      <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-brand-700/5 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-6xl lg:grid-cols-2">
        <aside className="hidden flex-col justify-center gap-6 px-10 lg:flex">
          <Link href="/" aria-label="Ir a la página de entrada" className="self-start">
            <BrandLockup size="lg" />
          </Link>
          <h1 className="text-[44px] font-extrabold leading-[1.05] tracking-tight text-brand-900">
            Orientación en salud para tu familia, a cualquier hora
          </h1>
          <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
            Hilda es un personaje creado con inteligencia artificial que te orienta siguiendo protocolos revisados por un médico. No diagnostica ni receta: te ayuda a entender qué está pasando y cuándo consultar.
          </p>
          {ACCESO_LIBRE && <p className="text-sm font-semibold text-teal-700">Gratis durante el lanzamiento · Sin tarjeta</p>}
        </aside>

        <main className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
          <Link href="/" aria-label="Ir a la página de entrada" className="mb-8 lg:hidden">
            <BrandLockup size="lg" />
          </Link>
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
