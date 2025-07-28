
'use client'

import { useContext } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  LayoutDashboard,
  ShieldAlert,
  FileText,
  CalendarClock,
  Pill,
  Settings,
  LogOut,
  User,
  Video,
  Siren,
  Loader2,
} from 'lucide-react';
import { UserContext } from '@/context/user-context';
import { Skeleton } from '../ui/skeleton';

const mainNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Mi Historial' },
  { href: '/dashboard/teleconsulta', icon: Video, label: 'Teleconsulta' },
  { href: '/dashboard/urgencias', icon: Siren, label: 'Urgencias y Domicilio' },
];

const secondaryNavItems = [
  { href: '/dashboard#personal-info', icon: User, label: 'Información Personal' },
  { href: '/dashboard#health-record', icon: ShieldAlert, label: 'Antecedentes y contactos' },
  { href: '/dashboard#documents', icon: FileText, label: 'Documentos' },
  { href: '/dashboard#appointments', icon: CalendarClock, label: 'Citas' },
  { href: '/dashboard#medications', icon: Pill, label: 'Medicamentos' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const context = useContext(UserContext);

  const isDashboardPage = pathname === '/dashboard';

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
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-32" />
                    </div>
                </div>
            </SidebarFooter>
        </>
    )
  }

  const { personalInfo } = context;
  const userFullName = `${personalInfo.firstName} ${personalInfo.lastName}`;
  const userInitials = personalInfo.firstName && personalInfo.lastName ? `${personalInfo.firstName[0]}${personalInfo.lastName[0]}` : 'U';
  const userEmail = context.user?.email || "usuario@ejemplo.com"; 

  return (
    <>
      <SidebarHeader>
        <Logo />
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {mainNavItems.map((item) => (
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
        {isDashboardPage && (
          <>
            <Separator className='my-4'/>
            <p className='px-4 mb-2 text-xs text-muted-foreground'>Secciones del Historial</p>
            <SidebarMenu>
            {secondaryNavItems.map((item) => (
                <SidebarMenuItem key={item.label}>
                <SidebarMenuButton asChild>
                    <a href={item.href}>
                    <item.icon />
                    <span>{item.label}</span>
                    </a>
                </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
            </SidebarMenu>
          </>
        )}
      </SidebarContent>
      <SidebarFooter>
        <Separator className="my-2" />
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex h-auto w-full justify-start items-center gap-3 p-2">
                    <Avatar className="h-9 w-9">
                        <AvatarImage src="https://placehold.co/100x100.png" alt="@user" data-ai-hint="user avatar" />
                        <AvatarFallback>{userInitials}</AvatarFallback>
                    </Avatar>
                    <div className="text-left">
                        <p className="font-medium text-sm">{userFullName}</p>
                        <p className="text-xs text-muted-foreground">{userEmail}</p>
                    </div>
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
                <DropdownMenuItem>
                    <User className="mr-2 h-4 w-4" />
                    <span>Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configuración</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                 <Link href="/">
                    <DropdownMenuItem>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Cerrar Sesión</span>
                    </DropdownMenuItem>
                </Link>
            </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </>
  );
}
