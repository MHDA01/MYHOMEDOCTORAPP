'use client';

import { useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { app, db } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { COLECCION_TUTOR } from '@/lib/constants';
import { Card, CardContent } from '@/components/ui/card';
import { HeartPulse } from 'lucide-react';

function todayDocId(): string {
  const now = new Date();
  const bogota = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yyyy = bogota.getFullYear();
  const mm = String(bogota.getMonth() + 1).padStart(2, '0');
  const dd = String(bogota.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function DailyTipCard() {
  const context = useContext(UserContext);
  const [tip, setTip] = useState<string | null>(null);

  useEffect(() => {
    const uid = context?.user?.uid;
    if (!uid) return;

    let cancelado = false;

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, COLECCION_TUTOR, uid, 'dailyTips', todayDocId()));
        if (snap.exists()) {
          if (!cancelado) setTip(snap.data().content as string);
          return;
        }

        // No existe el de hoy: el cron solo pregenera para quien tiene push
        // activado, así que aquí se pide bajo demanda. Así el costo de IA sigue
        // al uso real en vez de generarle un consejo cada mañana a quien no entra.
        const { getFunctions, httpsCallable } = await import('firebase/functions');
        const generar = httpsCallable<void, { content: string | null }>(
          getFunctions(app, 'us-central1'),
          'generateDailyTipNow'
        );
        const { data } = await generar();
        if (!cancelado && data?.content) setTip(data.content);
      } catch (error) {
        // Silencioso a propósito: el consejo del día es un extra: si falla, la
        // tarjeta simplemente no se muestra y el dashboard sigue funcionando.
        console.error('[DailyTipCard] Error cargando consejo del día:', error);
      }
    };

    load();
    return () => {
      cancelado = true;
    };
  }, [context?.user?.uid]);

  if (!tip) return null;

  return (
    <Card className="mx-4 mt-2 border-emerald-100 bg-emerald-50 md:mx-6">
      <CardContent className="flex items-start gap-3 p-2.5">
        <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Consejo del día</p>
          <p className="mt-1 text-sm text-emerald-900">{tip}</p>
        </div>
      </CardContent>
    </Card>
  );
}
