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
    <Card className="overflow-hidden border-border/70">
      <CardContent className="flex items-start gap-3 p-4 sm:p-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <HeartPulse className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Consejo del día</p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-foreground">{tip}</p>
        </div>
      </CardContent>
    </Card>
  );
}
