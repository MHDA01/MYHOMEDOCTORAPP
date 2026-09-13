'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BookCheck, LayoutDashboard, Lightbulb, ShieldAlert, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import { DashboardHeader } from '@/components/dashboard/header';
import { Skeleton } from '@/components/ui/skeleton';
import { useEsAdmin } from '@/hooks/use-es-admin';
import { cn } from '@/lib/utils';

type Seccion = { href: string; label: string; icon: LucideIcon };

const SECCIONES: Seccion[] = [
  { href: '/dashboard/admin', label: 'Resumen', icon: LayoutDashboard },
  { href: '/dashboard/admin/usuarios', label: 'Usuarios', icon: Users },
  { href: '/dashboard/admin/protocolos', label: 'Protocolos', icon: BookCheck },
  { href: '/dashboard/admin/consejos', label: 'Consejos del día', icon: Lightbulb },
  { href: '/dashboard/admin/crecimiento', label: 'Crecimiento', icon: TrendingUp },
];

function activa(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/dashboard/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Marco del panel de administración. Esconde el contenido a quien no es
 * administrador, pero la seguridad real está en el servidor: cada Server Action
 * vuelve a verificar la cuenta (src/lib/admin-access.ts).
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const esAdmin = useEsAdmin();

  return (
    <div className="flex min-h-full flex-col">
      <DashboardHeader />
      {esAdmin && (
        <nav aria-label="Secciones de administración" className="border-b border-border/70 bg-white">
          <ul className="mx-auto flex w-full max-w-6xl gap-1 overflow-x-auto px-3 [scrollbar-width:none] md:px-6 [&::-webkit-scrollbar]:hidden">
            {SECCIONES.map((s) => {
              const actual = activa(pathname, s.href);
              return (
                <li key={s.href} className="shrink-0">
                  <Link
                    href={s.href}
                    aria-current={actual ? 'page' : undefined}
                    className={cn(
                      'flex h-12 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition-colors',
                      actual ? 'border-primary text-brand-900' : 'border-transparent text-muted-foreground hover:text-brand-900'
                    )}
                  >
                    <s.icon className="h-4 w-4" />
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
      <main className="flex-1 px-4 py-5 md:px-8 md:py-7">
        <div className="mx-auto w-full max-w-6xl">
          {esAdmin === null ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full rounded-3xl" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            </div>
          ) : esAdmin ? (
            children
          ) : (
            <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-border/70 bg-white p-8 text-center shadow-soft">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-100 text-brand-800">
                <ShieldAlert className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-lg font-bold">Sección solo para administradores</h2>
              <p className="mt-1 text-sm text-muted-foreground">Tu cuenta no tiene acceso al panel de administración.</p>
              <Link href="/dashboard" className="mt-5 text-sm font-semibold text-primary hover:underline">
                Volver al inicio
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
