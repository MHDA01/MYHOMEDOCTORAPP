'use client';
import { SidebarTrigger } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";

export function DashboardHeader() {
  const pathname = usePathname();

  const getTitle = () => {
    switch (pathname) {
      case '/dashboard':
        return 'Mi Salud y la de mi Familia';
      case '/dashboard/teleconsulta':
        return 'Teleconsulta';
      case '/dashboard/urgencias':
        return 'Urgencias y Domicilio';
      default:
        return 'Mi Salud y la de mi Familia';
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b border-border bg-white px-4 shadow-sm md:px-6">
      <div className="md:hidden text-muted-foreground">
        <SidebarTrigger />
      </div>
      <div className="flex-1">
        <h1 className="text-xl font-semibold md:text-2xl font-headline text-foreground tracking-wide">{getTitle()}</h1>
      </div>
    </header>
  );
}
