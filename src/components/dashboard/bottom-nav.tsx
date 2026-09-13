'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEsAdmin } from '@/hooks/use-es-admin';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_ITEM, MAIN_NAV_ITEMS, isNavItemActive } from './nav-items';

/**
 * Barra de navegación inferior para celular, tomada del mockup.
 *
 * Se oculta en el chat: allí la pantalla es completa, como en el mockup, y se
 * vuelve al Inicio con la flecha de la cabecera. En computador (md+) la
 * navegación vive en el menú lateral.
 */
export function BottomNav() {
  const pathname = usePathname();
  const esAdmin = useEsAdmin();

  if (pathname?.startsWith('/dashboard/teleorientacion')) return null;

  const items = esAdmin ? [...MAIN_NAV_ITEMS, ADMIN_NAV_ITEM] : MAIN_NAV_ITEMS;

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around px-2">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors active:scale-95',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-brand-900'
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-sky-100'
                  )}
                >
                  <item.icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.3 : 1.9} />
                </span>
                {item.shortLabel}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
