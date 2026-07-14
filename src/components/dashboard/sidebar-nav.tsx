
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
import { Logo } from '@/components/logo';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import {
  LogOut,
  Loader2,
  MoreVertical,
  MessageCircleHeart,
  FileText,
  TrendingUp,
  Settings,
} from 'lucide-react';
import { UserContext } from '@/context/user-context';
import { auth } from '@/lib/firebase';
import { Skeleton } from '../ui/skeleton';


const mainNavItems = [
  { href: '/dashboard/teleorientacion', icon: MessageCircleHeart, label: 'Teleorientación' },
  { href: '/dashboard/reportes', icon: FileText, label: 'Mis Reportes PDF' },
];

const growthNavItem = { href: '/dashboard/growth', icon: TrendingUp, label: 'Agente de Crecimiento' };

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useContext(UserContext);
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
      if (!context?.user) return;
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
            <SidebarHeader>
                <Logo />
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
  const isFounder = !!process.env.NEXT_PUBLIC_FOUNDER_EMAIL && user?.email === process.env.NEXT_PUBLIC_FOUNDER_EMAIL;
  const navItems = isFounder ? [...mainNavItems, growthNavItem] : mainNavItems;

  return (
    <>
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent className="p-2">
        {tokenLoading ? (
          <div className="mb-3 h-20 animate-pulse rounded-2xl bg-slate-100" />
        ) : tokenState ? (
          <div className="mb-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  Tokens
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {(tokenState.tokens.free || 0) + (tokenState.tokens.paid || 0)} disponibles
                </p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                tokenState.needsPayment ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
              }`}>
                {tokenState.needsPayment ? 'Renovar' : 'Activo'}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              {tokenState.tokens.free || 0} gratis · {tokenState.tokens.paid || 0} premium
            </p>
            {tokenError && (
              <p className="mt-2 text-xs font-medium text-slate-600">
                Tokens no disponibles
              </p>
            )}
            {tokenState.needsPayment && (
              <Link
                href="/dashboard/teleorientacion"
                className="mt-3 inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
              >
                Renovar plan
              </Link>
            )}
          </div>
        ) : null}
        <SidebarMenu>
          {navItems.map((item) => (
            <SidebarMenuItem key={item.label}>
              <SidebarMenuButton asChild isActive={pathname === item.href}>
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
        <Separator className="my-2" />
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex h-auto w-full justify-start items-center gap-3 p-3 bg-accent text-accent-foreground hover:bg-accent/90 rounded-xl">
                    <Avatar className="h-9 w-9 border-2 border-white/30">
                        <AvatarImage src="https://placehold.co/100x100.png" alt="@user" data-ai-hint="user avatar" />
                        <AvatarFallback className="bg-white/20 text-white">{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="text-left flex-1 overflow-hidden">
                        <p className="font-medium text-sm truncate">{userFullName}</p>
                        <p className="text-xs text-white/70 truncate">{userEmail}</p>
                    </div>
                    <MoreVertical className="h-4 w-4 text-white/70 ml-auto" />
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
