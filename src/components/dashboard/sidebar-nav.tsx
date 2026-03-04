
'use client'

import { useContext } from 'react';
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
  HeartPulse,
  Settings,
  LogOut,
  User,
  Video,
  Siren,
  Loader2,
  MoreVertical,
  MessageCircleHeart,
} from 'lucide-react';
import { UserContext } from '@/context/user-context';
import { Skeleton } from '../ui/skeleton';
import { DownloadReportButton } from './download-report-button';

const mainNavItems = [
  { href: '/dashboard', icon: HeartPulse, label: 'Mi Salud y la de mi Familia' },
  { href: '/dashboard/teleorientacion', icon: MessageCircleHeart, label: 'Teleorientación' },
  { href: '/dashboard/teleconsulta', icon: Video, label: 'Teleconsulta' },
  { href: '/dashboard/urgencias', icon: Siren, label: 'Urgencias y Domicilio' },
];

export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useContext(UserContext);

  const handleLogout = async () => {
    if (context?.signOutUser) {
      await context.signOutUser();
      router.push('/login');
    }
  };

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
           <SidebarMenuItem>
             <DownloadReportButton />
           </SidebarMenuItem>
        </SidebarMenu>
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
                    <div className="text-left flex-1 overflow-hidden">
                        <p className="font-medium text-sm truncate">{userFullName}</p>
                        <p className="text-xs text-muted-foreground truncate">{userEmail}</p>
                    </div>
                    <MoreVertical className="h-4 w-4 text-muted-foreground ml-auto" />
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
                <DropdownMenuItem disabled>
                    <User className="mr-2 h-4 w-4" />
                    <span>Perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Configuración</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
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
