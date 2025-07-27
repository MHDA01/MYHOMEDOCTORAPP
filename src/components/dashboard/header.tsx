'use client';
import { SidebarTrigger } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";

export function DashboardHeader() {
  const pathname = usePathname();

  const getTitle = () => {
    switch (pathname) {
      case '/dashboard':
        return 'Mi Historial';
      case '/dashboard/teleconsulta':
        return 'Teleconsulta';
      case '/dashboard/urgencias':
        return 'Urgencias y Domicilio';
      default:
        return 'Mi Historial';
    }
  }

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background/80 px-4 backdrop-blur-sm md:px-6">
      <div className="md:hidden">
        <SidebarTrigger />
      </div>
      <div className="flex-1">
        <h1 className="text-xl font-semibold md:text-2xl font-headline">{getTitle()}</h1>
      </div>
    </header>
  );
}
