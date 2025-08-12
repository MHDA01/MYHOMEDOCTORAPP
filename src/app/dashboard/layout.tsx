
'use client';
import { SidebarProvider, Sidebar, SidebarInset } from "@/components/ui/sidebar";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { UserProvider } from "@/context/user-context";
import { useEffect } from 'react';
import { setupNotifications } from '@/lib/firebase-messaging';
import { auth } from '@/lib/firebase';
import { useToast } from "@/hooks/use-toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { toast } = useToast();

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(user => {
      if (user) {
        setTimeout(() => { // Agrega un pequeño retraso para asegurar que los permisos no sean bloqueados por el navegador
          setupNotifications(user.uid, toast).catch(console.error);
        }, 3000);
      }
    });

    return () => unsubscribe();
  }, [toast]);
  
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
