

'use client';
import { SidebarProvider, Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserProvider } from "@/context/user-context";
import { useToast } from "@/hooks/use-toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { toast } = useToast();

  // ...
  
  return (
    <UserProvider>
  <SidebarProvider defaultOpen={true} open={true}>
        <div className="flex min-h-screen">
          <Sidebar collapsible="none">
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
