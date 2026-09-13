'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, BookOpen, ExternalLink, FilePlus2, Loader2, Plus, ShieldCheck, Sparkles } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  crearMotivoAdmin,
  generarBorradorAdmin,
  listarProtocolosAdmin,
  type MotivoAdmin,
} from '@/app/actions/admin-protocolos';
import {
  CURSOS_DE_VIDA,
  ESTADOS_EN_PROCESO,
  MINUTOS_SIN_AVANCE,
  NOMBRE_ESTADO,
  nombreCursoDeVida,
  type FuenteProtocolo,
} from '@/lib/protocolos';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Etiqueta, MensajeError, Tarjeta, fecha } from './piezas';

async function token(): Promise<string> {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error('Inicia sesión de nuevo.');
  return t;
}

/** Acciones del panel; se pueden reemplazar para verlo con datos de ejemplo. */
export const accionesProtocolos = {
  listar: async () => listarProtocolosAdmin(await token()),
  crear: async (entrada: Parameters<typeof crearMotivoAdmin>[1]) => crearMotivoAdmin(await token(), entrada),
  generar: async (motivoId: string) => generarBorradorAdmin(await token(), motivoId),
};

function detenido(m: MotivoAdmin): boolean {
  const b = m.borrador;
  if (!b || !ESTADOS_EN_PROCESO.includes(b.estado)) return false;
  const ultima = b.actualizado_en ? new Date(b.actualizado_en).getTime() : 0;
  return Date.now() - ultima > MINUTOS_SIN_AVANCE * 60 * 1000;
}

function EstadoMotivo({ motivo }: { motivo: MotivoAdmin }) {
  const b = motivo.borrador;
  if (!b) return <Etiqueta>Sin borrador</Etiqueta>;
  if (detenido(motivo)) return <Etiqueta tono="malo">Se detuvo</Etiqueta>;
  if (ESTADOS_EN_PROCESO.includes(b.estado)) {
    return (
      <Etiqueta tono="info" className="gap-1.5">
        <Loader2 className="h-3 w-3 animate-spin" />
        {NOMBRE_ESTADO[b.estado]}
      </Etiqueta>
    );
  }
  if (b.estado === 'error') return <Etiqueta tono="malo">Falló</Etiqueta>;
  if (b.decididos < b.verificados) return <Etiqueta tono="aviso">En revisión</Etiqueta>;
  if (motivo.publicado && b.publicado_version) return <Etiqueta tono="ok">Publicado · versión {motivo.publicado.version}</Etiqueta>;
  return <Etiqueta tono="ok">Revisado, sin publicar</Etiqueta>;
}

export function ProtocolosAdminPanel({ acciones = accionesProtocolos }: { acciones?: typeof accionesProtocolos }) {
  const { toast } = useToast();
  const [fuentes, setFuentes] = useState<FuenteProtocolo[] | null>(null);
  const [motivos, setMotivos] = useState<MotivoAdmin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [generando, setGenerando] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<MotivoAdmin | null>(null);
  const temporizador = useRef<number | null>(null);

  const cargar = useCallback(async () => {
    try {
      const r = await acciones.listar();
      if (!r.success) return setError(r.error);
      setFuentes(r.data.fuentes);
      setMotivos(r.data.motivos);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los protocolos.');
    }
  }, [acciones]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Mientras algún borrador se esté generando, se consulta de nuevo cada 8 segundos.
  const hayEnProceso = motivos.some((m) => m.borrador && ESTADOS_EN_PROCESO.includes(m.borrador.estado) && !detenido(m));
  useEffect(() => {
    if (!hayEnProceso) return;
    temporizador.current = window.setInterval(cargar, 8000);
    return () => {
      if (temporizador.current) window.clearInterval(temporizador.current);
    };
  }, [hayEnProceso, cargar]);

  const generar = async (motivo: MotivoAdmin) => {
    setConfirmar(null);
    setGenerando(motivo.id);
    try {
      const r = await acciones.generar(motivo.id);
      if (!r.success) {
        toast({ variant: 'destructive', title: 'No se pudo generar', description: r.error });
      } else {
        toast({ title: 'Generando borrador', description: 'Tarda unos 3 minutos. Puedes salir de esta pantalla.' });
        await cargar();
      }
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se pudo generar', description: e instanceof Error ? e.message : '' });
    } finally {
      setGenerando(null);
    }
  };

  const pedirGeneracion = (motivo: MotivoAdmin) => {
    // Un borrador nuevo empieza la revisión desde cero: se pide confirmación si ya había decisiones.
    if (motivo.borrador && motivo.borrador.estado === 'listo' && motivo.borrador.decididos > 0) setConfirmar(motivo);
    else generar(motivo);
  };

  if (error && !fuentes) return <MensajeError>{error}</MensajeError>;
  if (!fuentes) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const titulos = new Map(fuentes.map((f) => [f.id, f.titulo]));

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-sky-200 bg-sky-50 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-primary shadow-soft">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div className="text-sm text-brand-900/85">
            <h2 className="text-base font-bold text-brand-900">Protocolos de la Dra. Hilda</h2>
            <p className="mt-1">
              Cada borrador sale solo de las guías oficiales de la biblioteca. Cada frase trae una cita literal que se comprueba
              automáticamente contra el texto de la guía, y un segundo modelo revisa que la frase no diga más que su cita.
            </p>
            <p className="mt-1 font-semibold">Nada llega a pacientes sin tu aprobación, frase por frase.</p>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">Motivos de consulta</h2>
          <Button onClick={() => setCreando(true)} className="rounded-full">
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo motivo
          </Button>
        </div>

        {!motivos.length && (
          <Tarjeta>
            <p className="text-sm text-muted-foreground">Todavía no hay motivos. Crea el primero para generar su borrador.</p>
          </Tarjeta>
        )}

        {motivos.map((m) => {
          const b = m.borrador;
          const enProceso = !!b && ESTADOS_EN_PROCESO.includes(b.estado) && !detenido(m);
          return (
            <Tarjeta key={m.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-brand-900">{m.motivo}</h3>
                  <p className="text-sm text-muted-foreground">
                    {nombreCursoDeVida(m.curso_de_vida)} · {m.edad}
                  </p>
                </div>
                <EstadoMotivo motivo={m} />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {m.fuentes.map((f) => (
                  <Etiqueta key={f} className="max-w-full">
                    <BookOpen className="mr-1 h-3 w-3 shrink-0" />
                    <span className="truncate">{titulos.get(f) ?? f}</span>
                  </Etiqueta>
                ))}
              </div>

              {b?.estado === 'listo' && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
                    <span>
                      {b.decididos} de {b.verificados} frases decididas
                    </span>
                    {b.marcados > 0 && <span className="text-red-700">{b.marcados} marcadas por fidelidad</span>}
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${b.verificados ? (b.decididos / b.verificados) * 100 : 0}%` }} />
                  </div>
                </div>
              )}

              {b?.estado === 'error' && b.error && (
                <p className="mt-3 flex gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-800">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {b.error}
                </p>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {b?.estado === 'listo' && (
                  <Button asChild className="rounded-full">
                    <Link href={`/dashboard/admin/protocolos/${b.id}`}>Revisar borrador</Link>
                  </Button>
                )}
                {enProceso ? (
                  <p className="text-xs text-muted-foreground">
                    Iniciado {fecha(b?.creado_en, true)}. Tarda unos 3 minutos; esta pantalla se actualiza sola.
                  </p>
                ) : (
                  <Button
                    variant={b?.estado === 'listo' ? 'outline' : 'default'}
                    className="rounded-full"
                    onClick={() => pedirGeneracion(m)}
                    disabled={generando === m.id}
                  >
                    {generando === m.id ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1.5 h-4 w-4" />}
                    {b ? 'Generar de nuevo' : 'Generar borrador'}
                  </Button>
                )}
                {m.publicado && (
                  <span className="text-xs text-muted-foreground">
                    Versión {m.publicado.version} publicada {fecha(m.publicado.en)}
                  </span>
                )}
              </div>
            </Tarjeta>
          );
        })}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-extrabold">Biblioteca cerrada</h2>
          <p className="text-sm text-muted-foreground">
            Las únicas guías de las que pueden salir frases. Cada una se comprueba con su huella digital antes de citarla.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {fuentes.map((f) => (
            <Tarjeta key={f.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold leading-snug text-brand-900">{f.titulo}</p>
                {f.disponible ? (
                  <Etiqueta tono="ok" className="shrink-0">{f.inventario_total} recomendaciones</Etiqueta>
                ) : (
                  <Etiqueta className="shrink-0">Sin inventario aún</Etiqueta>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {[f.entidad, f.anio, f.metodologia_calificacion].filter(Boolean).join(' · ')}
              </p>
              {f.nota && <p className="mt-2 text-xs text-amber-800">{f.nota}</p>}
              <a
                href={f.url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Ver PDF oficial <ExternalLink className="h-3 w-3" />
              </a>
            </Tarjeta>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Agregar una guía todavía no se hace desde el panel: hay que confirmar el PDF oficial y comprobar que sus recomendaciones se
          extraen completas.
        </p>
      </section>

      <NuevoMotivoDialog
        abierto={creando}
        onCerrar={() => setCreando(false)}
        fuentes={fuentes.filter((f) => f.disponible)}
        crear={acciones.crear}
        onCreado={async () => {
          setCreando(false);
          await cargar();
          toast({ title: 'Motivo creado', description: 'Ahora puedes generar su borrador.' });
        }}
      />

      <Dialog open={!!confirmar} onOpenChange={(open) => !open && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Generar un borrador nuevo?</DialogTitle>
            <DialogDescription>
              El borrador actual de «{confirmar?.motivo}» tiene {confirmar?.borrador?.decididos} frases decididas. El nuevo empieza la
              revisión desde cero; el actual se conserva y lo ya publicado no cambia.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button onClick={() => confirmar && generar(confirmar)}>Generar nuevo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NuevoMotivoDialog({
  abierto,
  onCerrar,
  fuentes,
  crear,
  onCreado,
}: {
  abierto: boolean;
  onCerrar: () => void;
  fuentes: FuenteProtocolo[];
  crear: (typeof accionesProtocolos)['crear'];
  onCreado: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [curso, setCurso] = useState<string>('');
  const [edad, setEdad] = useState('');
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) {
      setMotivo('');
      setCurso('');
      setEdad('');
      setElegidas([]);
      setError(null);
    }
  }, [abierto]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const r = await crear({ motivo, curso_de_vida: curso, edad, fuentes: elegidas });
      if (r.success) onCreado();
      else setError(r.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el motivo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(open) => !open && onCerrar()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={guardar} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus2 className="h-5 w-5 text-primary" />
              Nuevo motivo de consulta
            </DialogTitle>
            <DialogDescription>El borrador solo podrá usar las guías que elijas aquí.</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Por ejemplo: Diarrea" maxLength={80} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="curso">Curso de vida (Resolución 3280 de 2018)</Label>
            <select
              id="curso"
              value={curso}
              onChange={(e) => {
                setCurso(e.target.value);
                const elegido = CURSOS_DE_VIDA.find((c) => c.id === e.target.value);
                if (elegido && !edad) setEdad(elegido.rango);
              }}
              className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm"
            >
              <option value="" disabled>
                Elige un curso de vida
              </option>
              {CURSOS_DE_VIDA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.rango})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edad">Población</Label>
            <Input id="edad" value={edad} onChange={(e) => setEdad(e.target.value)} placeholder="menores de 5 años" maxLength={60} />
            <p className="text-xs text-muted-foreground">Usa la población que cubre la guía; por ejemplo, bronquiolitis es para menores de 2 años.</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Guías de la biblioteca</legend>
            {!fuentes.length && <p className="text-xs text-muted-foreground">No hay guías con inventario disponible.</p>}
            {fuentes.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border/70 p-3 text-sm hover:bg-sky-50">
                <Checkbox
                  checked={elegidas.includes(f.id)}
                  onCheckedChange={(v) => setElegidas((prev) => (v ? [...prev, f.id] : prev.filter((x) => x !== f.id)))}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium text-brand-900">{f.titulo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {f.anio} · {f.inventario_total} recomendaciones calificadas
                  </span>
                </span>
              </label>
            ))}
          </fieldset>

          {error && <p className="text-sm font-medium text-red-700">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Crear motivo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
