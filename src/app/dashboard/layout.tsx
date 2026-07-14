import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { DashboardSidebarGate } from "@/components/dashboard/dashboard-sidebar-gate";
import { NotificationPermissionBanner } from "@/components/dashboard/notification-permission-banner";
import { UserProvider } from "@/context/user-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <SidebarProvider>
        <div className="flex h-dvh overflow-hidden">
          <DashboardSidebarGate />
          <SidebarInset className="bg-secondary">
            <NotificationPermissionBanner />
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </UserProvider>
  );
}
