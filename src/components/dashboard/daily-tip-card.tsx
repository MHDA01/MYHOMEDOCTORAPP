'use client';

import { useContext, useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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

    const load = async () => {
      try {
        const snap = await getDoc(doc(db, COLECCION_TUTOR, uid, 'dailyTips', todayDocId()));
        if (snap.exists()) {
          setTip(snap.data().content as string);
        }
      } catch (error) {
        console.error('[DailyTipCard] Error cargando consejo del día:', error);
      }
    };

    load();
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
