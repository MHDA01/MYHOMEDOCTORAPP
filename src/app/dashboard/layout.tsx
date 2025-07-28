import { SidebarProvider, Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserProvider } from "@/context/user-context";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <UserProvider>
      <SidebarProvider>
        <div className="flex min-h-screen">
          <Sidebar>
            <SidebarNav />
          </Sidebar>
          <SidebarInset>
            <div className="flex-1">{children}</div>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </UserProvider>
  );
}
