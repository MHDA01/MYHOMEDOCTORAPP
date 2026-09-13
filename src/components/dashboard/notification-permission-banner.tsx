'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/context/user-context';
import { requestNotificationPermission } from '@/lib/push-notifications';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function NotificationPermissionBanner() {
  const context = useContext(UserContext);
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!context?.user) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'default') {
      setVisible(true);
    }
  }, [context?.user]);

  if (!visible || !context?.user) return null;

  const handleEnable = async () => {
    setLoading(true);
    const result = await requestNotificationPermission(context.user!.uid);
    setLoading(false);

    if (result.granted) {
      toast({
        title: 'Notificaciones activadas',
        description: 'Vas a recibir tu consejo de salud diario y tus recordatorios.',
      });
      setVisible(false);
      return;
    }

    // Antes el banner se ocultaba pasara lo que pasara, así que un fallo era
    // indistinguible de un éxito y nadie se enteraba de que no quedó activado.
    toast({
      variant: 'destructive',
      title: 'No se pudieron activar las notificaciones',
      description: result.error ?? 'Intenta de nuevo más tarde.',
    });
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-soft sm:p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-primary">
        <Bell className="h-5 w-5" />
      </span>
      <p className="min-w-0 flex-1 text-sm leading-snug text-brand-900">
        Activa las notificaciones para recibir tu consejo de salud diario y recordatorios.
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <Button size="sm" onClick={handleEnable} disabled={loading}>
          Activar
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setVisible(false)}
          aria-label="Cerrar aviso"
          className="h-9 w-9 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
