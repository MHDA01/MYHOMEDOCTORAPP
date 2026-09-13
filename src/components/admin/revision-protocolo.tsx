'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ExternalLink, Loader2, Pencil, RotateCcw, Send, X } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { decidirItemAdmin, obtenerBorradorAdmin, publicarProtocoloAdmin } from '@/app/actions/admin-protocolos';
import {
  ESTADOS_EN_PROCESO,
  NOMBRE_ESTADO,
  RAZONES_EXCLUSION,
  SECCIONES_PROTOCOLO,
  nombreCursoDeVida,
  type BorradorProtocolo,
  type Decision,
  type DecisionItem,
  type FuenteProtocolo,
  type ItemProtocolo,
} from '@/lib/protocolos';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Etiqueta, MensajeError, Tarjeta, fecha, type TonoEtiqueta } from './piezas';

async function token(): Promise<string> {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error('Inicia sesión de nuevo.');
  return t;
}

/** Acciones de la revisión; se pueden reemplazar para verla con datos de ejemplo. */
export const accionesRevision = {
  obtener: async (borradorId: string) => obtenerBorradorAdmin(await token(), borradorId),
  decidir: async (...args: Parameters<typeof decidirItemAdmin> extends [string, ...infer R] ? R : never) =>
    decidirItemAdmin(await token(), ...args),
  publicar: async (borradorId: string) => publicarProtocoloAdmin(await token(), borradorId),
};

type Filtro = 'todas' | 'pendientes' | 'fidelidad' | 'producto' | 'adaptacion';

const FILTROS: Array<{ id: Filtro; nombre: string; aplica: (i: ItemProtocolo, r?: DecisionItem) => boolean }> = [
  { id: 'todas', nombre: 'Todas', aplica: () => true },
  { id: 'pendientes', nombre: 'Pendientes', aplica: (_i, r) => !r },
  { id: 'fidelidad', nombre: 'Marcadas por fidelidad', aplica: (i) => !!i.revisar_fidelidad },
  { id: 'producto', nombre: 'Producto o cantidad', aplica: (i) => i.requiere_decision_medica },
  { id: 'adaptacion', nombre: 'Con adaptación', aplica: (i) => !!i.adaptacion },
];

const NOMBRE_DECISION: Record<Decision, { texto: string; tono: TonoEtiqueta }> = {
  aprobar: { texto: 'Aprobada', tono: 'ok' },
  corregir: { texto: 'Corregida', tono: 'info' },
  rechazar: { texto: 'Rechazada', tono: 'malo' },
};

function tonoAlerta(alerta: string): TonoEtiqueta {
  if (alerta.startsWith('fidelidad')) return 'malo';
  if (alerta.startsWith('adaptación')) return 'aviso';
  return 'gris';
}

export function RevisionProtocolo({ borradorId, acciones = accionesRevision }: { borradorId: string; acciones?: typeof accionesRevision }) {
  const { toast } = useToast();
  const [borrador, setBorrador] = useState<BorradorProtocolo | null>(null);
  const [fuentes, setFuentes] = useState<FuenteProtocolo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [publicar, setPublicar] = useState(false);
  const [publicando, setPublicando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await acciones.obtener(borradorId);
      if (!r.success) return setError(r.error);
      setBorrador(r.data.borrador);
      setFuentes(r.data.fuentes);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el borrador.');
    }
  }, [borradorId, acciones]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const enProceso = !!borrador && ESTADOS_EN_PROCESO.includes(borrador.estado);
  useEffect(() => {
    if (!enProceso) return;
    const id = window.setInterval(cargar, 8000);
    return () => window.clearInterval(id);
  }, [enProceso, cargar]);

  const fuentePorId = useMemo(() => new Map(fuentes.map((f) => [f.id, f])), [fuentes]);

  const decidir = async (item: ItemProtocolo, decision: Decision | 'pendiente', textoCorregido?: string, nota?: string) => {
    if (!borrador) return;
    const anterior = borrador.revision[item.id];
    const nueva = { ...borrador.revision };
    if (decision === 'pendiente') delete nueva[item.id];
    else nueva[item.id] = { decision, texto_corregido: textoCorregido ?? null, nota: nota ?? null, por: '', en: new Date().toISOString() };
    setBorrador({ ...borrador, revision: nueva });
    try {
      const r = await acciones.decidir(borrador.id, item.id, { decision, textoCorregido, nota });
      if (!r.success) throw new Error(r.error);
      return true;
    } catch (e) {
      setBorrador((b) => {
        if (!b) return b;
        const revertida = { ...b.revision };
        if (anterior) revertida[item.id] = anterior;
        else delete revertida[item.id];
        return { ...b, revision: revertida };
      });
      toast({ variant: 'destructive', title: 'No se guardó', description: e instanceof Error ? e.message : '' });
      return false;
    }
  };

  const confirmarPublicacion = async () => {
    if (!borrador) return;
    setPublicando(true);
    try {
      const r = await acciones.publicar(borrador.id);
      if (!r.success) throw new Error(r.error);
      toast({ title: `Versión ${r.data.version} publicada` });
      setPublicar(false);
      await cargar();
    } catch (e) {
      toast({ variant: 'destructive', title: 'No se publicó', description: e instanceof Error ? e.message : '' });
    } finally {
      setPublicando(false);
    }
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Volver />
        <MensajeError>{error}</MensajeError>
      </div>
    );
  }
  if (!borrador) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  const { motivo, metricas } = borrador;
  const verificados = borrador.items.filter((i) => i.verificacion.estado === 'verificado');
  const descartados = borrador.items.filter((i) => i.verificacion.estado !== 'verificado');
  const decisiones = verificados.map((i) => borrador.revision[i.id]).filter(Boolean);
  const pendientes = verificados.length - decisiones.length;
  const cuenta = (d: Decision) => decisiones.filter((x) => x.decision === d).length;
  const aplica = FILTROS.find((f) => f.id === filtro)!.aplica;
  const cambiosSinPublicar =
    !!borrador.publicado_en && !!borrador.revision_actualizada_en && borrador.revision_actualizada_en > borrador.publicado_en;
  const m = (clave: string) => (typeof metricas?.[clave] === 'number' ? (metricas[clave] as number) : 0);

  return (
    <div className="space-y-5">
      <Volver />

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-brand-900">{motivo.motivo}</h2>
          <p className="text-sm text-muted-foreground">
            {nombreCursoDeVida(motivo.curso_de_vida)} · {motivo.edad}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {borrador.importado ? 'Borrador del piloto' : 'Borrador'} generado {fecha(borrador.generado ?? borrador.creado_en, true)}
            {borrador.modelo_redactor ? ` con ${borrador.modelo_redactor}` : ''}. Nada de esto llega a pacientes sin tu aprobación.
          </p>
        </div>
        <Etiqueta tono={borrador.estado === 'listo' ? 'ok' : borrador.estado === 'error' ? 'malo' : 'info'}>
          {NOMBRE_ESTADO[borrador.estado]}
        </Etiqueta>
      </header>

      {enProceso && (
        <Tarjeta className="flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm">Generando el borrador. Tarda unos 3 minutos; esta pantalla se actualiza sola.</p>
        </Tarjeta>
      )}
      {borrador.estado === 'error' && <MensajeError>{borrador.error ?? 'La generación falló.'}</MensajeError>}

      {borrador.estado === 'listo' && (
        <>
          {borrador.uso_juez?.juez_confiable === false && (
            <div className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              <p>
                <b>Atención:</b> el juez de fidelidad no detectó una frase trampa conocida en esta corrida; sus marcas no son confiables.
                Revisa todas las frases con más cuidado.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [m('recomendaciones_en_inventario'), 'recomendaciones calificadas en la guía'],
              [m('recomendaciones_incluidas'), 'usadas en el protocolo'],
              [m('verificados'), 'frases con cita verificada'],
              [m('rechazados_por_cita'), 'descartadas: la cita no está en la guía'],
              [m('marcados_por_fidelidad'), 'posible infidelidad a la cita'],
              [m('con_adaptacion_declarada'), 'adaptaciones a teleorientación'],
              [m('requieren_decision_medica'), 'mencionan producto o cantidad'],
              [m('sin_decision'), 'recomendaciones que la IA no evaluó'],
            ].map(([valor, texto]) => (
              <div key={texto as string} className="rounded-xl border border-border/70 bg-white p-3">
                <p className="text-xl font-extrabold text-brand-900">{valor}</p>
                <p className="text-xs leading-snug text-muted-foreground">{texto}</p>
              </div>
            ))}
          </div>

          <Tarjeta className="text-sm text-brand-900/85">
            <b className="text-brand-900">Cómo revisar:</b> lee cada frase contra su cita. Si la frase dice algo que la cita no dice,
            corrígela o recházala. Abre la página del PDF cuando dudes del contexto. Las frases que corrijas quedan marcadas como
            corregidas por ti.
          </Tarjeta>

          {/* Barra de avance: queda fija arriba mientras se revisa */}
          <div className="sticky top-[117px] z-10 -mx-4 border-y border-border/70 bg-white/95 px-4 py-3 backdrop-blur md:top-[65px] md:-mx-8 md:px-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm">
                <p className="font-bold text-brand-900">
                  {decisiones.length} de {verificados.length} frases decididas
                </p>
                <p className="text-xs text-muted-foreground">
                  {cuenta('aprobar')} aprobadas · {cuenta('corregir')} corregidas · {cuenta('rechazar')} rechazadas
                  {borrador.publicado_version ? ` · versión ${borrador.publicado_version} publicada` : ''}
                  {cambiosSinPublicar ? ' · hay cambios sin publicar' : ''}
                </p>
              </div>
              <Button className="rounded-full" disabled={pendientes > 0} onClick={() => setPublicar(true)}>
                <Send className="mr-1.5 h-4 w-4" />
                {pendientes > 0 ? `Faltan ${pendientes}` : borrador.publicado_version ? 'Publicar de nuevo' : 'Publicar protocolo'}
              </Button>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {FILTROS.map((f) => {
                const total = verificados.filter((i) => f.aplica(i, borrador.revision[i.id])).length;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltro(f.id)}
                    className={cn(
                      'shrink-0 rounded-full border px-3 py-1 text-xs font-semibold transition-colors',
                      filtro === f.id ? 'border-primary bg-primary text-white' : 'border-border bg-white text-brand-900 hover:bg-sky-50'
                    )}
                  >
                    {f.nombre} ({total})
                  </button>
                );
              })}
            </div>
          </div>

          {SECCIONES_PROTOCOLO.map((seccion) => {
            const todos = verificados.filter((i) => i.seccion === seccion.id);
            const visibles = todos.filter((i) => aplica(i, borrador.revision[i.id]));
            if (filtro !== 'todas' && !visibles.length) return null;
            return (
              <section key={seccion.id} className="space-y-3">
                <h3 className="text-lg font-extrabold text-brand-900">
                  {seccion.titulo} <span className="text-sm font-semibold text-muted-foreground">({todos.length})</span>
                </h3>
                {!todos.length && <p className="text-sm text-muted-foreground">La guía no cubre esta sección.</p>}
                {visibles.map((item) => (
                  <TarjetaItem
                    key={item.id}
                    item={item}
                    fuente={fuentePorId.get(item.fuente)}
                    decision={borrador.revision[item.id]}
                    onDecidir={(d, texto, nota) => decidir(item, d, texto, nota)}
                  />
                ))}
              </section>
            );
          })}

          {borrador.partes_no_usadas.length > 0 && (
            <Plegable titulo={`Partes de recomendaciones incluidas que no se usaron (${borrador.partes_no_usadas.length})`}>
              <p className="text-sm text-muted-foreground">
                La IA tomó estas recomendaciones pero no convirtió estas partes en frases. Revisa si alguna debería estar en el protocolo.
              </p>
              {borrador.partes_no_usadas.map((p) => (
                <div key={p.rec_id} className="rounded-xl border border-border/70 bg-white p-3">
                  <p className="text-xs text-muted-foreground">
                    página {p.pagina} · {p.calificacion}
                  </p>
                  {p.segmentos.map((s, n) => (
                    <Cita key={n}>{s}</Cita>
                  ))}
                </div>
              ))}
            </Plegable>
          )}

          {borrador.excluidas.length > 0 && (
            <Plegable titulo={`Recomendaciones de la guía que la IA dejó fuera (${borrador.excluidas.length}) — revisa que no falte ninguna importante`}>
              {borrador.excluidas.map((x) => (
                <div key={x.rec_id} className="rounded-xl border border-border/70 bg-white p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <b>{x.rec_id.split('#').pop()}</b> · página {x.pagina} · {x.calificacion}
                    <Etiqueta>{RAZONES_EXCLUSION[x.razon ?? ''] ?? x.razon}</Etiqueta>
                  </div>
                  <Cita>{x.texto.length > 600 ? `${x.texto.slice(0, 600)}…` : x.texto}</Cita>
                </div>
              ))}
            </Plegable>
          )}

          {borrador.sin_decision.length > 0 && (
            <Tarjeta className="space-y-2 border-amber-200">
              <h3 className="font-bold">Sin evaluar ({borrador.sin_decision.length})</h3>
              <p className="text-sm text-muted-foreground">La IA no tomó decisión sobre estas recomendaciones; conviene generar de nuevo.</p>
              {borrador.sin_decision.map((x) => (
                <div key={x.rec_id} className="text-xs">
                  <p className="text-muted-foreground">
                    página {x.pagina} · {x.calificacion}
                  </p>
                  <Cita>{x.texto.slice(0, 400)}</Cita>
                </div>
              ))}
            </Tarjeta>
          )}

          {borrador.vacios.length > 0 && (
            <Tarjeta>
              <h3 className="font-bold">Lo que la guía no cubre</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-brand-900/85">
                {borrador.vacios.map((v, n) => (
                  <li key={n}>{v}</li>
                ))}
              </ul>
            </Tarjeta>
          )}

          {descartados.length > 0 && (
            <Plegable titulo={`Descartadas automáticamente (${descartados.length})`}>
              {descartados.map((i) => (
                <div key={i.id} className="rounded-xl border border-border/70 bg-white p-3">
                  <p className="text-sm font-semibold">
                    <span className="mr-1.5 text-primary">{i.id}</span>
                    {i.texto}
                  </p>
                  <Cita>{i.cita_literal}</Cita>
                  <Etiqueta tono="malo">{i.verificacion.razones.join('; ')}</Etiqueta>
                </div>
              ))}
            </Plegable>
          )}
        </>
      )}

      <Dialog open={publicar} onOpenChange={setPublicar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar «{motivo.motivo}»</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Se publicará la versión {(borrador.publicado_version ?? 0) + 1} con {cuenta('aprobar') + cuenta('corregir')} frases (
                  {cuenta('corregir')} corregidas por ti). Las {cuenta('rechazar')} rechazadas no se incluyen.
                </p>
                <p>
                  La Dra. Hilda todavía no usa los protocolos publicados: activarlo es un paso aparte. Publicar deja esta versión lista y
                  registrada con tu nombre y la fecha.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublicar(false)}>
              Cancelar
            </Button>
            <Button onClick={confirmarPublicacion} disabled={publicando}>
              {publicando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Volver() {
  return (
    <Link href="/dashboard/admin/protocolos" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
      <ArrowLeft className="h-4 w-4" />
      Protocolos
    </Link>
  );
}

function Cita({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-2 rounded-r-lg border-l-[3px] border-primary bg-sky-50 px-3 py-2 text-sm leading-relaxed text-brand-900/80">
      {children}
    </blockquote>
  );
}

function Plegable({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <section className="rounded-2xl border border-border/70 bg-white shadow-soft">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        className="flex w-full items-center justify-between gap-3 p-4 text-left text-sm font-bold text-brand-900"
      >
        {titulo}
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', abierto && 'rotate-180')} />
      </button>
      {abierto && <div className="space-y-2 border-t border-border/70 p-4">{children}</div>}
    </section>
  );
}

function TarjetaItem({
  item,
  fuente,
  decision,
  onDecidir,
}: {
  item: ItemProtocolo;
  fuente?: FuenteProtocolo;
  decision?: DecisionItem;
  onDecidir: (d: Decision | 'pendiente', texto?: string, nota?: string) => Promise<boolean | undefined>;
}) {
  const [editando, setEditando] = useState<'corregir' | 'rechazar' | null>(null);
  const [texto, setTexto] = useState(item.texto);
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);

  const abrir = (modo: 'corregir' | 'rechazar') => {
    setTexto(decision?.texto_corregido ?? item.texto);
    setNota(decision?.nota ?? '');
    setEditando(modo);
  };

  const guardar = async (d: Decision | 'pendiente', t?: string, n?: string) => {
    setGuardando(true);
    const ok = await onDecidir(d, t, n);
    setGuardando(false);
    if (ok) setEditando(null);
  };

  const url = fuente?.url && item.pagina ? `${fuente.url}#page=${item.pagina}` : fuente?.url;
  const estado = decision ? NOMBRE_DECISION[decision.decision] : null;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-white p-4 shadow-soft transition-colors',
        !decision && 'border-border/70',
        decision?.decision === 'aprobar' && 'border-teal-200',
        decision?.decision === 'corregir' && 'border-sky-300',
        decision?.decision === 'rechazar' && 'border-red-200 bg-red-50/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {decision?.decision === 'corregir' && decision.texto_corregido ? (
            <>
              <p className="text-base font-semibold text-brand-900">
                <span className="mr-1.5 text-primary">{item.id}</span>
                {decision.texto_corregido}
              </p>
              <p className="mt-1 text-xs text-muted-foreground line-through">{item.texto}</p>
            </>
          ) : (
            <p className={cn('text-base font-semibold text-brand-900', decision?.decision === 'rechazar' && 'text-brand-900/60')}>
              <span className="mr-1.5 text-primary">{item.id}</span>
              {item.texto}
            </p>
          )}
        </div>
        {estado && <Etiqueta tono={estado.tono} className="shrink-0">{estado.texto}</Etiqueta>}
      </div>

      {item.citas_literales.map((c, n) => (
        <Cita key={n}>{c}</Cita>
      ))}

      <p className="text-xs text-muted-foreground">
        <span className="line-clamp-1 inline">{fuente?.titulo ?? item.fuente}</span>
        {url && (
          <>
            {' · '}
            <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
              página {item.pagina} del PDF <ExternalLink className="h-3 w-3" />
            </a>
          </>
        )}
      </p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Etiqueta tono="ok">Calificación de la guía: {item.calificacion_literal}</Etiqueta>
        {item.requiere_decision_medica && <Etiqueta tono="aviso">Requiere tu decisión: producto o cantidad</Etiqueta>}
        {item.verificacion.alertas.map((a, n) => (
          <Etiqueta key={n} tono={tonoAlerta(a)} className="text-left">
            {a}
          </Etiqueta>
        ))}
      </div>

      {decision?.nota && !editando && <p className="mt-2 text-xs text-brand-900/80">Tu nota: {decision.nota}</p>}

      {editando ? (
        <div className="mt-3 space-y-2 rounded-xl bg-sky-50 p-3">
          {editando === 'corregir' && (
            <>
              <label className="text-xs font-semibold text-brand-900" htmlFor={`texto-${item.id}`}>
                Frase corregida
              </label>
              <Textarea id={`texto-${item.id}`} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} rows={3} className="bg-white" />
            </>
          )}
          <label className="text-xs font-semibold text-brand-900" htmlFor={`nota-${item.id}`}>
            Nota {editando === 'rechazar' ? '(por qué la rechazas, opcional)' : '(opcional)'}
          </label>
          <Textarea id={`nota-${item.id}`} value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={2} className="bg-white" />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="rounded-full"
              disabled={guardando}
              variant={editando === 'rechazar' ? 'destructive' : 'default'}
              onClick={() => guardar(editando, editando === 'corregir' ? texto : undefined, nota)}
            >
              {guardando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              {editando === 'corregir' ? 'Guardar corrección' : 'Rechazar frase'}
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditando(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={decision?.decision === 'aprobar' ? 'default' : 'outline'}
            className="rounded-full"
            disabled={guardando}
            onClick={() => guardar('aprobar')}
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            Aprobar
          </Button>
          <Button size="sm" variant={decision?.decision === 'corregir' ? 'default' : 'outline'} className="rounded-full" onClick={() => abrir('corregir')}>
            <Pencil className="mr-1 h-3.5 w-3.5" />
            Corregir
          </Button>
          <Button size="sm" variant={decision?.decision === 'rechazar' ? 'destructive' : 'outline'} className="rounded-full" onClick={() => abrir('rechazar')}>
            <X className="mr-1 h-3.5 w-3.5" />
            Rechazar
          </Button>
          {decision && (
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={guardando} onClick={() => guardar('pendiente')}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Deshacer
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
