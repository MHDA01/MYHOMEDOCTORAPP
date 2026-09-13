import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { DashboardSidebarGate } from "@/components/dashboard/dashboard-sidebar-gate";
import { DashboardContent } from "@/components/dashboard/dashboard-content";
import { BottomNav } from "@/components/dashboard/bottom-nav";
import { UserProvider } from "@/context/user-context";

// El aviso para activar notificaciones ya no va aquí, encima de todas las
// pantallas: vive en el Inicio (components/dashboard/inicio.tsx). Encima del
// chat se comía espacio de la conversación.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <SidebarProvider>
        <div className="flex h-dvh w-full overflow-hidden">
          <DashboardSidebarGate />
          <SidebarInset className="bg-sky-50/60">
            <DashboardContent>{children}</DashboardContent>
          </SidebarInset>
        </div>
        <BottomNav />
      </SidebarProvider>
    </UserProvider>
  );
}
