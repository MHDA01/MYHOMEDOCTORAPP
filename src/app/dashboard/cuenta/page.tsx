'use client';

import { useContext, useEffect, useState } from 'react';
import { collection, doc, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { EncabezadoPantalla } from '@/components/dashboard/encabezado-pantalla';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ChevronRight, FileDown, Gift, Loader2, ShieldCheck } from 'lucide-react';
import { ACCESO_LIBRE } from '@/config/acceso';
import { puedeCancelarRenovacion } from '@/lib/cancelar-renovacion';
import { etiquetaDePago, pagoPendienteDemasiado, pesosCop } from '@/lib/pagos';

type Pago = {
  id: string;
  amount: number;
  status?: string;
  description?: string;
  reference?: string;
  createdAt?: Timestamp | Date;
};

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
  const [pagos, setPagos] = useState<Pago[]>([]);

  // Historial de pagos: las reglas dejan leerlo a su dueña y escribirlo solo al servidor.
  useEffect(() => {
    if (!userId) return;
    const consulta = query(
      collection(db, 'Cuentas_Tutor', userId, 'transactions'),
      orderBy('createdAt', 'desc'),
      limit(12)
    );
    return onSnapshot(
      consulta,
      (snap) => setPagos(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Pago, 'id'>) }))),
      () => setPagos([])
    );
  }, [userId]);

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
  const puedeCancelar = puedeCancelarRenovacion(tokenInfo);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 md:px-8 md:pt-8">
      <EncabezadoPantalla titulo="Mi cuenta" descripcion={ACCESO_LIBRE ? 'Tu acceso a MyHomeDoctorApp.' : 'Tu plan y la renovación automática.'} />

      <div className="mt-5 flex flex-col gap-4 md:mt-7">
        {ACCESO_LIBRE && (
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 to-brand-800 p-5 text-white shadow-card sm:p-6">
            <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/5" />
            <span aria-hidden className="pointer-events-none absolute -bottom-16 right-10 h-40 w-40 rounded-full bg-primary/10" />
            <div className="relative flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-white">
                <Gift className="h-6 w-6" />
              </span>
              <div>
                <p className="text-lg font-bold leading-snug sm:text-xl">Tu cuenta es gratuita</p>
                <p className="mt-1 text-sm leading-relaxed text-white/80 sm:text-[15px]">
                  Durante el lanzamiento de MyHomeDoctorApp puedes usar la orientación con Hilda sin
                  ningún costo y sin registrar una tarjeta. Si algún día esto cambia, te avisaremos con anticipación.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* En la etapa gratuita la tarjeta de renovación solo aparece si alguien quedó con una
            suscripción antigua, para que siempre pueda cancelarla. */}
        {(!ACCESO_LIBRE || tokenInfo?.paymentSourceId) && (
          <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-soft sm:p-6">
            <h2 className="text-lg font-bold text-brand-900">Renovación automática mensual</h2>
            <div className="mt-4 space-y-4">
              {loading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </div>
              ) : cancelledJustNow ? (
                <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  <p>
                    Tu renovación automática fue cancelada. Seguirás teniendo acceso hasta el final del
                    período ya pagado, sin ningún cobro adicional.
                  </p>
                </div>
              ) : !tokenInfo?.paymentSourceId ? (
                <p className="text-[15px] text-muted-foreground">
                  No tienes una renovación automática configurada. Puedes activarla desde el plan de
                  Teleorientación cuando lo necesites.
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-sky-50 p-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estado</p>
                      <p className="mt-0.5 text-lg font-bold text-brand-900">
                        {STATUS_LABELS[tokenInfo?.subscriptionStatus || 'none']}
                      </p>
                    </div>
                    {isActive && nextBillingDate && (
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximo cobro</p>
                        <p className="mt-0.5 text-sm font-semibold text-brand-900">
                          {nextBillingDate.toLocaleDateString('es-CO', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 flex-shrink-0 text-primary" />
                    <p>
                      Solo guardamos una referencia segura de tu tarjeta entregada por Wompi; nunca
                      almacenamos el número completo en nuestros servidores.
                    </p>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <p>{error}</p>
                    </div>
                  )}

                  {tokenInfo?.autoRenew && tokenInfo?.subscriptionStatus === 'payment_failed' && (
                    <p className="text-sm text-muted-foreground">
                      No pudimos cobrar tu renovación y la vamos a reintentar. Si prefieres no continuar,
                      cancélala aquí y no se te cobrará más.
                    </p>
                  )}
                  {tokenInfo?.autoRenew && tokenInfo?.subscriptionStatus === 'pending' && (
                    <p className="text-sm text-muted-foreground">
                      Estamos confirmando tu último pago con el banco. Puedes cancelar la renovación; si ese
                      pago se aprueba, cubre este mes y no habrá más cobros.
                    </p>
                  )}

                  {puedeCancelar && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={cancelling}
                      className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-white px-6 text-[15px] font-semibold text-brand-900 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {cancelling ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Cancelando...
                        </>
                      ) : (
                        'Cancelar renovación automática'
                      )}
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        )}

        {/* Pagos: solo aparece si ya hubo alguno, así que en la etapa gratuita no se ve. */}
        {pagos.length > 0 && (
          <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-soft sm:p-6" aria-labelledby="titulo-pagos">
            <h2 id="titulo-pagos" className="text-lg font-bold text-brand-900">Tus pagos</h2>
            <ul className="mt-4 divide-y divide-border/60">
              {pagos.map((p) => {
                const fecha = toDate(p.createdAt);
                return (
                  <li key={p.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-brand-900">{p.description || 'Pago'}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {fecha
                            ? fecha.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })
                            : 'Fecha sin registrar'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[15px] font-bold text-brand-900">{pesosCop(p.amount)}</p>
                        <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{etiquetaDePago(p.status)}</p>
                      </div>
                    </div>
                    {p.reference && (
                      <p className="mt-1.5 break-all text-[11px] text-muted-foreground">
                        Referencia: <span className="select-all font-mono">{p.reference}</span>
                      </p>
                    )}
                    {pagoPendienteDemasiado(p.status, fecha) && (
                      <p className="mt-1.5 text-xs text-amber-800">
                        Este pago lleva más de un día sin confirmarse. Si el banco ya lo descontó, comunícate con
                        nosotros y dinos esta referencia.
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Ley 1581 de 2012: la persona tiene que poder llevarse sus datos y
            pedir que no quede nada, sin escribirle a nadie. */}
        <Link
          href="/dashboard/cuenta/mis-datos"
          className="flex items-center gap-4 rounded-3xl border border-border/70 bg-white p-5 shadow-soft transition-shadow hover:shadow-card sm:p-6"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-teal-700">
            <FileDown className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-brand-900">Mis datos</h2>
            <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
              Descarga una copia de todo lo que guardamos de tu familia, o bórralo.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
