'use client';

import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { ArrowRight, FileText, MessageCircleHeart, UserRound, type LucideIcon } from 'lucide-react';
import { UserContext } from '@/context/user-context';
import { auth } from '@/lib/firebase';
import { getSecureFamilyMembers } from '@/app/actions/family';
import type { FamilyProfile } from '@/lib/types';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { BrandLockup } from '@/components/brand-lockup';
import DraHildaAvatar from '@/components/ui/avatar';
import { DailyTipCard } from './daily-tip-card';
import { NotificationPermissionBanner } from './notification-permission-banner';

/**
 * Pantalla de Inicio, siguiendo la jerarquía del mockup:
 * identidad → saludo → Dra. Hilda → accesos → consejo del día → familia.
 *
 * No agrega funciones: cada tarjeta lleva a una pantalla que ya existía, y el
 * consejo del día y el aviso de notificaciones son los mismos componentes que
 * antes estaban apilados encima del chat.
 *
 * Quedan fuera a propósito (aparecen en el mockup, pero todavía no existen):
 * Historial de salud, Medicamentos y recordatorios, Educación en salud.
 */

type QuickAccess = { href: string; title: string; description: string; icon: LucideIcon };

const QUICK_ACCESS: QuickAccess[] = [
  { href: '/dashboard/teleorientacion', title: 'Orientación médica', description: 'Con la Dra. Hilda', icon: MessageCircleHeart },
  { href: '/dashboard/reportes', title: 'Mis informes', description: 'PDF de tus consultas', icon: FileText },
  { href: '/dashboard/cuenta', title: 'Mi cuenta', description: 'Tu plan y consultas', icon: UserRound },
];

// Muchos nombres están guardados en mayúsculas ("ALEXANDER"); solo se ajusta
// cómo se muestran, el dato no se toca.
function nombrePropio(nombre: string | undefined): string {
  if (!nombre) return '';
  return nombre.charAt(0).toLocaleUpperCase('es-CO') + nombre.slice(1).toLocaleLowerCase('es-CO');
}

function initials(member: FamilyProfile): string {
  return `${member.firstName?.charAt(0) ?? ''}${member.lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';
}

export function Inicio() {
  const context = useContext(UserContext);
  const user = context?.user ?? null;
  const firstName = nombrePropio(context?.personalInfo?.firstName?.split(' ')[0]);
  const [members, setMembers] = useState<FamilyProfile[]>([]);

  // Misma lectura que hace el chat para el selector de integrante.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const list = (await getSecureFamilyMembers(idToken)) as FamilyProfile[];
        const sorted = [...list].sort((a, b) => Number(!!b.esTitular) - Number(!!a.esTitular));
        if (!cancelado) setMembers(sorted);
      } catch (error) {
        // La fila de familia es informativa: si falla, simplemente no se muestra.
        console.error('[Inicio] Error cargando integrantes:', error);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-8 md:px-8 md:pt-8">
      {/* Barra superior del celular; en computador el logo está en el menú lateral */}
      <div className="flex h-[76px] items-center justify-between md:hidden">
        <BrandLockup />
        <SidebarTrigger className="h-10 w-10 text-brand-900 [&_svg]:size-5" />
      </div>

      <section className="pt-3 md:pt-0">
        <h1 className="text-[26px] font-extrabold md:text-[32px]">
          {firstName ? `Hola, ${firstName}` : 'Hola'} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-[15px] text-muted-foreground">Tu salud y la de tu familia, en un solo lugar.</p>
      </section>

      <div className="mt-5 grid gap-4 md:mt-7 md:grid-cols-5 md:gap-6">
        <div className="flex flex-col gap-4 md:col-span-3 md:gap-6">
          <NotificationPermissionBanner />

          {/* Tarjeta principal: la Dra. Hilda */}
          <Link
            href="/dashboard/teleorientacion"
            className="group relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 to-brand-800 p-5 text-white shadow-card transition-transform active:scale-[0.99] sm:p-6"
          >
            <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/5" />
            <span aria-hidden className="pointer-events-none absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-primary/10" />
            <div className="relative flex items-start gap-4">
              <div className="relative shrink-0">
                <DraHildaAvatar size="lg" />
                <span className="absolute -bottom-1 -right-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white ring-2 ring-brand-900">
                  IA
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-snug sm:text-xl">¿Tienes una duda de salud?</p>
                <p className="mt-1 text-sm leading-relaxed text-white/80">
                  Cuéntale a la Dra. Hilda qué está pasando. Es tu asistente médica con inteligencia artificial y te
                  orienta paso a paso.
                </p>
              </div>
            </div>
            <span className="relative mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-bold text-brand-900 shadow-soft transition-colors group-hover:bg-sky-50">
              Hablar con la Dra. Hilda
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>

          {/* Accesos rápidos */}
          <nav aria-label="Accesos rápidos" className="grid grid-cols-3 gap-3">
            {QUICK_ACCESS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-white px-2 py-4 text-center shadow-soft transition-all hover:-translate-y-0.5 hover:shadow-card active:scale-[0.98] sm:py-5"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-primary sm:h-12 sm:w-12">
                  <item.icon className="h-[22px] w-[22px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-bold leading-tight text-brand-900 sm:text-sm">{item.title}</span>
                  <span className="mt-1 hidden text-xs text-muted-foreground sm:block">{item.description}</span>
                </span>
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-4 md:col-span-2 md:gap-6">
          <DailyTipCard />

          {members.length > 0 && (
            <section className="rounded-2xl border border-border/70 bg-white p-4 shadow-soft sm:p-5">
              <h2 className="text-base font-bold md:text-lg">Tu familia</h2>
              <ul className="mt-3 flex gap-4 overflow-x-auto pb-1">
                {members.map((m) => (
                  <li key={m.id} className="shrink-0">
                    <Link href="/dashboard/teleorientacion" className="flex w-16 flex-col items-center gap-1.5 text-center">
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-sky-100 text-base font-bold text-brand-800 shadow-soft ring-2 ring-white">
                        {initials(m)}
                      </span>
                      <span className="w-full truncate text-xs font-semibold text-brand-900">
                        {m.esTitular ? 'Tú' : nombrePropio(m.firstName?.split(' ')[0])}
                      </span>
                      <span className="-mt-1 w-full truncate text-[11px] text-muted-foreground">
                        {m.esTitular ? 'Titular' : m.relationship}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
