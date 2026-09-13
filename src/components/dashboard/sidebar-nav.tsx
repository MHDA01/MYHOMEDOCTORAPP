
'use client'

import { useContext, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from '@/components/ui/sidebar';
import { LogoCompleto } from '@/components/brand-lockup';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  MoreVertical,
  Settings,
} from 'lucide-react';
import { ADMIN_NAV_ITEM, MAIN_NAV_ITEMS, isNavItemActive } from './nav-items';
import { ACCESO_LIBRE } from '@/config/acceso';
import { UserContext } from '@/context/user-context';
import { useEsAdmin } from '@/hooks/use-es-admin';
import { auth } from '@/lib/firebase';
import { Skeleton } from '../ui/skeleton';



export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useContext(UserContext);
  const esAdmin = useEsAdmin();
  const [tokenState, setTokenState] = useState<{
    available: boolean;
    tokens: { free: number; paid: number };
    needsPayment: boolean;
  } | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState(false);

  const handleLogout = async () => {
    if (context?.signOutUser) {
      await context.signOutUser();
      router.push('/login');
    }
  };

  useEffect(() => {
    let isMounted = true;

    const fetchTokenState = async () => {
      // Etapa gratuita: no hay saldo que mostrar (src/config/acceso.ts).
      if (ACCESO_LIBRE || !context?.user) return;
      setTokenLoading(true);

      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;

        const response = await fetch('/api/user/tokens', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });

        if (!response.ok) {
          throw new Error('No se pudo cargar el estado de tokens');
        }

        const data = await response.json();
        if (isMounted) {
          setTokenState(data);
          setTokenError(false);
        }
      } catch (error) {
        console.error('[SidebarNav] Error cargando tokens:', error);
        if (isMounted) {
          setTokenState({ available: false, tokens: { free: 0, paid: 0 }, needsPayment: false });
          setTokenError(true);
        }
      } finally {
        if (isMounted) {
          setTokenLoading(false);
        }
      }
    };

    fetchTokenState();
    const interval = window.setInterval(fetchTokenState, 60000);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
    };
  }, [context?.user]);

  if (context?.loading || !context?.personalInfo) {
    return (
        <>
            <SidebarHeader className="items-center px-4 pb-3 pt-6">
                <LogoCompleto />
            </SidebarHeader>
            <SidebarContent className="p-2 space-y-2">
               <Skeleton className="h-8 w-full" />
               <Skeleton className="h-8 w-full" />
               <Skeleton className="h-8 w-full" />
            </SidebarContent>
            <SidebarFooter>
                <Separator className="my-2" />
                <div className="flex items-center gap-3 p-2">
                    <Skeleton className="h-9 w-9 rounded-full" />
                    <div className="space-y-2 flex-1">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                </div>
            </SidebarFooter>
        </>
    )
  }

  const { personalInfo, user } = context;
  const userFullName = personalInfo?.firstName && personalInfo?.lastName ? `${personalInfo.firstName} ${personalInfo.lastName}` : (user?.displayName || 'Usuario');
  const userInitials = userFullName ? userFullName.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : 'U';
  const userEmail = user?.email || "invitado@ejemplo.com";
  const navItems = esAdmin ? [...MAIN_NAV_ITEMS, ADMIN_NAV_ITEM] : MAIN_NAV_ITEMS;

  return (
    <>
      <SidebarHeader className="items-center px-4 pb-3 pt-6">
        <LogoCompleto />
      </SidebarHeader>
      <SidebarContent className="px-3">
        {tokenLoading ? (
          <div className="mb-4 h-[92px] animate-pulse rounded-2xl bg-sky-50" />
        ) : tokenState ? (
          <div className="mb-4 rounded-2xl border border-border bg-sky-50 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-muted-foreground">Consultas disponibles</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                tokenState.needsPayment ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-teal-700'
              }`}>
                {tokenState.needsPayment ? 'Renovar' : 'Activo'}
              </span>
            </div>
            <p className="mt-1 text-2xl font-extrabold text-brand-900">
              {(tokenState.tokens.free || 0) + (tokenState.tokens.paid || 0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {tokenState.tokens.free || 0} gratis · {tokenState.tokens.paid || 0} premium
            </p>
            {tokenError && (
              <p className="mt-2 text-xs font-medium text-muted-foreground">
                Tokens no disponibles
              </p>
            )}
            {tokenState.needsPayment && (
              <Link
                href="/dashboard/teleorientacion"
                className="mt-3 inline-flex rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-brand-900 hover:bg-warning/25"
              >
                Renovar plan
              </Link>
            )}
          </div>
        ) : null}
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton
                asChild
                isActive={isNavItemActive(pathname, item.href)}
                className="h-11 gap-3 px-4 font-semibold text-brand-900/80 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:shadow-soft [&>svg]:size-5"
              >
                <Link href={item.href}>
                  <item.icon />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}

        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex h-auto w-full items-center justify-start gap-3 rounded-2xl border border-border bg-white p-2.5 text-brand-900 hover:bg-sky-50">
                    <Avatar className="h-9 w-9">
                                                <AvatarFallback className="bg-primary text-xs font-bold text-primary-foreground">{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="text-left flex-1 overflow-hidden">
                        <p className="truncate text-sm font-semibold">{userFullName}</p>
                        <p className="truncate text-xs font-normal text-muted-foreground">{userEmail}</p>
                    </div>
                    <MoreVertical className="ml-auto h-4 w-4 text-muted-foreground" />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{userFullName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                    {userEmail}
                    </p>
                </div>
                </DropdownMenuLabel>

                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                    <Link href="/dashboard/cuenta">
                        <Settings className="mr-2 h-4 w-4" />
                        <span>Mi cuenta</span>
                    </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Cerrar Sesión</span>
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
}
