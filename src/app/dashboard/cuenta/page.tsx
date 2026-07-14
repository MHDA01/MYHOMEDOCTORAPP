'use client';

import { useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { DashboardHeader } from '@/components/dashboard/header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';

type TokenInfo = {
  free?: number;
  paid?: number;
  autoRenew?: boolean;
  subscriptionStatus?: 'none' | 'active' | 'pending' | 'cancelled' | 'payment_failed';
  nextBillingDate?: Timestamp | Date;
  paymentSourceId?: string | number;
};

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === 'function') return value.toDate();
  return new Date(value);
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Activa',
  pending: 'Confirmando pago...',
  cancelled: 'Cancelada',
  payment_failed: 'Pago fallido',
  none: 'Sin renovación automática',
};

export default function CuentaPage() {
  const context = useContext(UserContext);
  const userId = context?.user?.uid;
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelledJustNow, setCancelledJustNow] = useState(false);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const ref = doc(db, 'Cuentas_Tutor', userId, 'tokens', 'config');
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setTokenInfo(snap.exists() ? (snap.data() as TokenInfo) : null);
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, [userId]);

  const handleCancel = async () => {
    setError(null);
    setCancelling(true);
    try {
      const cancelAutoRenewal = httpsCallable(functions, 'cancelAutoRenewal');
      await cancelAutoRenewal({});
      setCancelledJustNow(true);
    } catch (err: any) {
      setError(err?.message || 'No se pudo cancelar la renovación automática. Intenta de nuevo.');
    } finally {
      setCancelling(false);
    }
  };

  const nextBillingDate = toDate(tokenInfo?.nextBillingDate);
  const isActive = tokenInfo?.autoRenew && tokenInfo?.subscriptionStatus === 'active';

  return (
    <div className="flex h-full flex-col">
      <DashboardHeader />
      <main className="flex-1 p-4 md:p-6 lg:p-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Renovación automática mensual</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
            </div>
          ) : cancelledJustNow ? (
            <div className="flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
              <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
              <p>
                Tu renovación automática fue cancelada. Seguirás teniendo acceso hasta el final del
                período ya pagado, sin ningún cobro adicional.
              </p>
            </div>
          ) : !tokenInfo?.paymentSourceId ? (
            <p className="text-sm text-slate-600">
              No tienes una renovación automática configurada. Puedes activarla desde el plan de
              Teleorientación cuando lo necesites.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                <div>
                  <p className="text-sm text-slate-500">Estado</p>
                  <p className="text-lg font-semibold text-slate-900">
                    {STATUS_LABELS[tokenInfo?.subscriptionStatus || 'none']}
                  </p>
                </div>
                {isActive && nextBillingDate && (
                  <div className="text-right">
                    <p className="text-sm text-slate-500">Próximo cobro</p>
                    <p className="text-sm font-medium text-slate-900">
                      {nextBillingDate.toLocaleDateString('es-CO', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                <p>
                  Solo guardamos una referencia segura de tu tarjeta entregada por Wompi; nunca
                  almacenamos el número completo en nuestros servidores.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              {isActive && (
                <Button
                  variant="outline"
                  onClick={handleCancel}
                  disabled={cancelling}
                  className="w-full"
                >
                  {cancelling ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelando...
                    </>
                  ) : (
                    'Cancelar renovación automática'
                  )}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
        </div>
      </main>
    </div>
  );
}
