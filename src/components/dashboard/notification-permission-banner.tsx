'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/context/user-context';
import { requestNotificationPermission } from '@/lib/push-notifications';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';

export function NotificationPermissionBanner() {
  const context = useContext(UserContext);
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
    setVisible(false);
    return result;
  };

  return (
    <div className="mx-4 mt-2 flex items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-1.5 text-xs md:mx-6">
      <div className="flex items-center gap-2 text-blue-900">
        <Bell className="h-3.5 w-3.5 shrink-0" />
        <span>Activa las notificaciones para recibir tu consejo de salud diario y recordatorios.</span>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" onClick={handleEnable} disabled={loading}>
          Activar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setVisible(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
