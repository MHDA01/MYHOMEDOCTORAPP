
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  LayoutDashboard,
  ShieldAlert,
  FileText,
  CalendarClock,
  Pill,
  Settings,
  LogOut,
  MoreVertical,
  Phone,
  Video,
  Siren,
  User,
} from 'lucide-react';
import { UserContext } from '@/context/user-context';
import { DownloadReportButton } from './download-report-button';




export function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();
  const context = useContext(UserContext);

  const isDashboardPage = pathname === '/dashboard';

  const handleLogout = async () => {
    if (context?.signOutUser) {
      await context.signOutUser();
      router.push('/login');
    }
  };

  // Usar datos genéricos si no existen
  const personalInfo = context?.personalInfo || { firstName: 'Invitado', lastName: '' };
  const user = context?.user || { displayName: 'Usuario', email: 'invitado@ejemplo.com' };
  const userFullName = personalInfo.firstName && personalInfo.lastName ? `${personalInfo.firstName} ${personalInfo.lastName}` : (user.displayName || 'Usuario');
  const userInitials = userFullName ? userFullName.split(' ').map((n: string) => n[0]).join('').substring(0,2).toUpperCase() : 'U';
  const userEmail = user.email || "invitado@ejemplo.com";

  return (
    <>
  <SidebarHeader className="items-center pt-5 pb-4 px-4">
        <img
          src="https://i.postimg.cc/SsRdwdzD/LOGO-1-transparent.png"
          alt="Logo"
          className="h-48 w-auto mx-auto"
        />
      </SidebarHeader>
  <SidebarContent className="pt-2 pb-2 px-2">
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
                        <AvatarImage src="https://i.postimg.cc/J7N5r89y/LOGO-1.png" alt="@user" data-ai-hint="user avatar" />
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
                <a href="#personal-info">
                    <DropdownMenuItem>
                        <User className="mr-2 h-4 w-4" />
                        <span>Perfil</span>
                    </DropdownMenuItem>
                </a>
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
