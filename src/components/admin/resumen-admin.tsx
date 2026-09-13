'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, Bell, FileText, HeartHandshake, Lightbulb, MessageCircleHeart, MessagesSquare, RefreshCw, UserCheck } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { obtenerResumenAdmin, type ResumenAdmin } from '@/app/actions/admin-seguimiento';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Cifra, MensajeError, Tarjeta, fecha, numero } from './piezas';

function etiquetaSemana(inicio: string): string {
  const d = new Date(`${inicio}T12:00:00Z`);
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

async function obtenerConSesion() {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Inicia sesión de nuevo.');
  return obtenerResumenAdmin(idToken);
}

/** `obtener` se puede reemplazar para ver el panel con datos de ejemplo. */
export function ResumenAdminPanel({ obtener = obtenerConSesion }: { obtener?: typeof obtenerConSesion }) {
  const [datos, setDatos] = useState<ResumenAdmin | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await obtener();
      if (r.success) {
        setDatos(r.data);
        setError(null);
      } else {
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen.');
    } finally {
      setCargando(false);
    }
  }, [obtener]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (error && !datos) return <MensajeError>{error}</MensajeError>;
  if (!datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  const { cuentas, consultas } = datos;
  const avance = Math.min(100, (cuentas.total / datos.meta) * 100);
  const maxSemana = Math.max(1, ...datos.semanas.flatMap((s) => [s.registros, s.consultas]));

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-900 to-brand-800 p-5 text-white shadow-card sm:p-6">
        <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-white/75">Camino a {numero(datos.meta)} usuarios</p>
            <p className="mt-1 text-4xl font-extrabold sm:text-5xl">
              {numero(cuentas.total)}
              <span className="ml-2 text-lg font-semibold text-white/60">de {numero(datos.meta)}</span>
            </p>
            <p className="mt-1 text-sm text-white/80">
              +{numero(cuentas.nuevas7)} en los últimos 7 días · +{numero(cuentas.nuevas30)} en 30 días
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={cargar}
            disabled={cargando}
            className="rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <RefreshCw className={cargando ? 'mr-2 h-4 w-4 animate-spin' : 'mr-2 h-4 w-4'} />
            Actualizar
          </Button>
        </div>
        <div className="relative mt-5 h-3 w-full overflow-hidden rounded-full bg-white/15" role="progressbar" aria-valuenow={Math.round(avance)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(avance, 1)}%` }} />
        </div>
        <p className="relative mt-2 text-xs text-white/70">
          {avance.toFixed(1)} % de la meta. La app es gratuita hasta llegar a ella; volver a cobrar es una decisión manual.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra icon={UserCheck} titulo="Cuentas activas" valor={numero(cuentas.activas7)} detalle={`últimos 7 días · ${numero(cuentas.activas30)} en 30 días`} />
        <Cifra icon={MessageCircleHeart} titulo="Consultas nuevas" valor={numero(consultas.iniciadas7)} detalle={`últimos 7 días · ${numero(consultas.iniciadas30)} en 30 días`} />
        <Cifra icon={Activity} titulo="Consultas con actividad" valor={numero(consultas.conActividad7)} detalle="con mensajes en los últimos 7 días" />
        <Cifra icon={MessagesSquare} titulo="Consultas en total" valor={numero(consultas.total)} detalle={`${numero(consultas.cuentasQueConsultaron)} cuentas han consultado`} />
        <Cifra icon={MessagesSquare} titulo="Mensajes por consulta" valor={consultas.mensajesPromedio === null ? '—' : consultas.mensajesPromedio.toLocaleString('es-CO')} detalle="promedio, contando los de la Dra. Hilda" />
        <Cifra icon={HeartHandshake} titulo="Integrantes de familia" valor={numero(datos.familia.integrantes)} detalle={`agregados en ${numero(datos.familia.cuentasConFamilia)} cuentas`} />
        <Cifra icon={FileText} titulo="Informes PDF" valor={numero(datos.informes)} detalle="generados en total" />
        <Cifra icon={Bell} titulo="Notificaciones" valor={numero(datos.notificaciones)} detalle="cuentas con avisos activados" />
      </div>

      <Tarjeta>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold md:text-lg">Últimas 12 semanas</h2>
          <div className="flex items-center gap-4 text-xs font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-800" />Registros</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" />Consultas nuevas</span>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <div className="flex h-44 min-w-[560px] items-end gap-2">
            {datos.semanas.map((s) => (
              <div key={s.inicio} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-full w-full items-end justify-center gap-1">
                  {[
                    { valor: s.registros, clase: 'bg-brand-800', nombre: 'registros' },
                    { valor: s.consultas, clase: 'bg-primary', nombre: 'consultas nuevas' },
                  ].map((barra) => (
                    <div key={barra.nombre} className="flex h-full w-1/2 max-w-[18px] flex-col items-center justify-end">
                      <span className="mb-0.5 text-[10px] font-semibold text-muted-foreground">{barra.valor || ''}</span>
                      <div
                        title={`${barra.valor} ${barra.nombre}, semana del ${etiquetaSemana(s.inicio)}`}
                        className={`w-full rounded-t ${barra.clase}`}
                        style={{ height: `${(barra.valor / maxSemana) * 80}%`, minHeight: barra.valor ? 3 : 0 }}
                      />
                    </div>
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">{etiquetaSemana(s.inicio)}</span>
              </div>
            ))}
          </div>
        </div>
      </Tarjeta>

      <div className="grid gap-3 md:grid-cols-2">
        <Tarjeta>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Consejo del día</h2>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Hoy se generaron {numero(datos.consejosHoy.generados)} consejos y {numero(datos.consejosHoy.enviados)} llegaron como notificación.
          </p>
        </Tarjeta>
        <Tarjeta>
          <h2 className="text-sm font-bold">Cómo se cuentan estas cifras</h2>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>Cuentas: personas registradas; incluye las cuentas de prueba del equipo.</li>
            <li>Activas: abrieron la app en el periodo (según la última sesión renovada).</li>
            <li>Consultas: conversaciones con al menos un mensaje. Nunca se lee su contenido.</li>
            <li>Actualizado {fecha(datos.generadoEn, true)}.</li>
          </ul>
        </Tarjeta>
      </div>
      {error && <MensajeError>{error}</MensajeError>}
    </div>
  );
}
