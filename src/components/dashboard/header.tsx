'use client';
import { SidebarTrigger } from "@/components/ui/sidebar";
import { usePathname } from "next/navigation";
import { BrandLockup } from "@/components/brand-lockup";

export function DashboardHeader() {
  const pathname = usePathname();

  const getTitle = () => {
    switch (pathname) {
      case '/dashboard':
        return 'Inicio';
      case '/dashboard/teleorientacion':
        return 'Teleorientación';
      case '/dashboard/reportes':
        return 'Mis informes';
      case '/dashboard/growth':
        return 'Agente de Crecimiento';
      case '/dashboard/growth/tips':
        return 'Consejos Diarios';
      case '/dashboard/cuenta':
        return 'Mi cuenta';
      default:
        return 'Teleorientación';
    }
  }

  return (
    <header className="sticky top-0 z-10 border-b border-border/70 bg-white/90 backdrop-blur">
      {/* En celular el logo va arriba, como en el mockup; en computador ya está en el menú lateral. */}
      <div className="flex h-[76px] items-center justify-between px-4 md:hidden">
        <BrandLockup />
        <SidebarTrigger className="h-10 w-10 text-brand-900 [&_svg]:size-5" />
      </div>
      <div className="flex items-center px-4 pb-3 md:h-16 md:px-8 md:pb-0">
        <h1 className="text-xl font-extrabold text-brand-900 md:text-2xl">{getTitle()}</h1>
      </div>
    </header>
  );
}
