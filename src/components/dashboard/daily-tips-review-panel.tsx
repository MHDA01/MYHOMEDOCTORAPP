'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/context/user-context';
import { auth } from '@/lib/firebase';
import { getDailyTipsSample, type DailyTipSampleItem } from '@/app/actions/daily-tips-review';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DailyTipsReviewPanel() {
  const context = useContext(UserContext);
  const [items, setItems] = useState<DailyTipSampleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!context?.user) return;
      setLoading(true);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) {
          setError('No autenticado. Por favor, inicia sesión de nuevo.');
          return;
        }
        const result = await getDailyTipsSample(idToken);
        if (!result.success) {
          setError(result.error || 'No se pudo cargar la muestra de consejos.');
          return;
        }
        setItems(result.items || []);
        setError(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [context?.user]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{error}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Muestra de consejos enviados hoy</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando muestra...</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no hay consejos generados hoy (el job automático corre una vez al día).
          </p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 text-sm">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-semibold">{item.userName}</span>
                <div className="flex gap-1">
                  {item.isNewUser && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Nuevo
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    item.pushSent ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    {item.pushSent ? 'Push enviado' : 'Sin push'}
                  </span>
                </div>
              </div>
              <p className="text-foreground">{item.content}</p>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
