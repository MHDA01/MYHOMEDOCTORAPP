'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, MessageSquareText, RefreshCw, Stethoscope } from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  abrirConsultaAdmin,
  listarConsultasAdmin,
  marcarConsultaRevisada,
  obtenerTranscripcionAdmin,
  type ConsultaAbierta,
  type ConsultaEnCola,
  type MensajeTranscrito,
} from '@/app/actions/admin-consultas';
import { ETIQUETA_NIVEL, type NivelAtencion, type Severidad } from '@/lib/resumen-consulta';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Etiqueta, MensajeError, Tarjeta, fecha, haceCuanto, type TonoEtiqueta } from './piezas';

/**
 * La bandeja del médico: las consultas de los últimos 30 días, las más graves
 * primero, y el resumen de la que se abra en una sola pantalla.
 *
 * El orden de la tarjeta no es decorativo: primero las señales de alarma, al
 * final lo que quedó sin preguntar. La idea es decidir sin bajar la vista y
 * abrir la conversación completa solo cuando algo no cuadre.
 */

const TONO_NIVEL: Record<NivelAtencion, TonoEtiqueta> = {
  urgencias: 'malo',
  consulta_prioritaria: 'aviso',
  consulta_general: 'info',
  casa: 'ok',
};

const BORDE_NIVEL: Record<NivelAtencion, string> = {
  urgencias: 'border-red-300 bg-red-50',
  consulta_prioritaria: 'border-amber-300 bg-amber-50',
  consulta_general: 'border-sky-200 bg-sky-50',
  casa: 'border-teal-200 bg-teal-50',
};

const TONO_SEVERIDAD: Record<Severidad, TonoEtiqueta> = { critica: 'malo', alta: 'aviso', moderada: 'gris' };
const NOMBRE_SEVERIDAD: Record<Severidad, string> = { critica: 'Crítica', alta: 'Alta', moderada: 'Moderada' };

async function conSesion<T>(usar: (idToken: string) => Promise<T>): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Inicia sesión de nuevo.');
  return usar(idToken);
}

const listarConSesion = () => conSesion((t) => listarConsultasAdmin(t));
const abrirConSesion = (uid: string, convId: string, forzar?: boolean) =>
  conSesion((t) => abrirConsultaAdmin(t, uid, convId, forzar));
const transcripcionConSesion = (uid: string, convId: string) => conSesion((t) => obtenerTranscripcionAdmin(t, uid, convId));
const revisarConSesion = (uid: string, convId: string, nota: string) =>
  conSesion((t) => marcarConsultaRevisada(t, uid, convId, nota));

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <div className="mt-1 text-sm text-brand-900">{children}</div>
    </div>
  );
}

function Fichas({ items, tono }: { items: string[]; tono: TonoEtiqueta }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">—</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <li key={`${t}-${i}`}>
          <Etiqueta tono={tono}>{t}</Etiqueta>
        </li>
      ))}
    </ul>
  );
}

/** Una fila de la bandeja. */
function FilaConsulta({
  consulta,
  activa,
  onAbrir,
}: {
  consulta: ConsultaEnCola;
  activa: boolean;
  onAbrir: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        aria-current={activa ? 'true' : undefined}
        className={cn(
          'w-full rounded-2xl border p-3 text-left transition-colors',
          activa ? 'border-primary bg-sky-50' : 'border-border/70 bg-white hover:bg-slate-50'
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-bold text-brand-900">{consulta.paciente}</p>
          {consulta.nivel ? (
            <Etiqueta tono={TONO_NIVEL[consulta.nivel]}>{ETIQUETA_NIVEL[consulta.nivel]}</Etiqueta>
          ) : (
            <Etiqueta tono="gris">Sin leer</Etiqueta>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {haceCuanto(consulta.ultimaActividad)} · {consulta.mensajes} mensajes
          {consulta.banderas > 0 && ` · ${consulta.banderas} ${consulta.banderas === 1 ? 'alarma' : 'alarmas'}`}
        </p>
        {consulta.revisadaEn && (
          <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-teal-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Revisada {fecha(consulta.revisadaEn)}
          </p>
        )}
      </button>
    </li>
  );
}

/** El resumen de una consulta, pensado para decidir sin bajar la vista. */
function TarjetaResumen({
  consulta,
  onRegenerar,
  onVerChat,
  onRevisar,
  ocupado,
}: {
  consulta: ConsultaAbierta;
  onRegenerar: () => void;
  onVerChat: () => void;
  onRevisar: (nota: string) => Promise<void>;
  ocupado: boolean;
}) {
  const { resumen, paciente } = consulta;
  const [nota, setNota] = useState(consulta.nota);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setNota(consulta.nota), [consulta.convId, consulta.nota]);

  const quienEs = [
    paciente.nombre || 'Sin nombre',
    paciente.edad !== undefined ? `${paciente.edad} años` : null,
    paciente.sexo ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Tarjeta className="space-y-4">
      <header className={cn('-m-4 mb-0 rounded-t-2xl border-b p-4 sm:-m-5 sm:mb-0 sm:p-5', BORDE_NIVEL[resumen.nivel])}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-lg font-extrabold text-brand-900">{ETIQUETA_NIVEL[resumen.nivel]}</p>
          <Etiqueta tono={resumen.confianza === 'alta' ? 'ok' : resumen.confianza === 'media' ? 'aviso' : 'malo'}>
            Confianza {resumen.confianza}
          </Etiqueta>
        </div>
        <p className="mt-1 text-sm font-semibold text-brand-900">{quienEs}</p>
        <p className="mt-0.5 text-sm text-brand-900">{resumen.porQue}</p>
      </header>

      {resumen.banderas.length > 0 && (
        <Seccion titulo="Señales de alarma">
          <ul className="space-y-2">
            {resumen.banderas.map((b, i) => (
              <li key={`${b.senal}-${i}`} className="rounded-xl border border-red-200 bg-red-50 p-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-red-800">
                      {b.senal} <Etiqueta tono={TONO_SEVERIDAD[b.severidad]}>{NOMBRE_SEVERIDAD[b.severidad]}</Etiqueta>
                    </p>
                    <p className="mt-0.5 text-sm italic text-red-900">«{b.evidencia}»</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Seccion titulo="Motivo">
          <p className="font-semibold">{resumen.motivo}</p>
          <p className="text-muted-foreground">Evolución: {resumen.evolucion}</p>
        </Seccion>
        <Seccion titulo="Relato">{resumen.relato}</Seccion>
        <Seccion titulo="Síntomas que refiere">
          <Fichas items={resumen.sintomas.presentes} tono="info" />
        </Seccion>
        <Seccion titulo="Síntomas que niega">
          <Fichas items={resumen.sintomas.negados} tono="gris" />
        </Seccion>
      </div>

      <Seccion titulo="Antecedentes que pesan aquí">
        <Fichas items={resumen.antecedentesRelevantes} tono="aviso" />
      </Seccion>

      <Seccion titulo="Qué le dijo Hilda">
        <p>{resumen.orientoHilda}</p>
        {resumen.discrepancia && (
          <p className="mt-1.5 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-900">
            <strong>Diferencia con el relato:</strong> {resumen.discrepancia}
          </p>
        )}
      </Seccion>

      {resumen.sinPreguntar.length > 0 && (
        <Seccion titulo="Quedó sin preguntar">
          <ul className="list-inside list-disc space-y-0.5">
            {resumen.sinPreguntar.map((q, i) => (
              <li key={`${q}-${i}`}>{q}</li>
            ))}
          </ul>
        </Seccion>
      )}

      <div className="space-y-2 border-t border-border/70 pt-4">
        <label htmlFor="nota-medico" className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Tu conducta
        </label>
        <Textarea
          id="nota-medico"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={2}
          maxLength={2000}
          placeholder="Qué decidiste con este paciente."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={async () => {
              setGuardando(true);
              try {
                await onRevisar(nota);
              } finally {
                setGuardando(false);
              }
            }}
            disabled={guardando || ocupado}
          >
            {guardando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            Marcar revisada
          </Button>
          <Button variant="outline" onClick={onVerChat} disabled={ocupado}>
            <MessageSquareText className="mr-2 h-4 w-4" />
            Ver la conversación
          </Button>
          <Button variant="ghost" onClick={onRegenerar} disabled={ocupado}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Rehacer el resumen
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Resumen hecho por {consulta.modelo} el {fecha(consulta.generadoEn, true)} sobre {consulta.mensajesResumidos}{' '}
          mensajes
          {consulta.mensajesAhora > consulta.mensajesResumidos &&
            ` · la consulta siguió y ya va en ${consulta.mensajesAhora}: rehaz el resumen`}
          .
          {consulta.revisadaPor && ` Revisada por ${consulta.revisadaPor} el ${fecha(consulta.revisadaEn, true)}.`}
        </p>
        <p className="text-xs text-muted-foreground">
          Lo escribió un modelo a partir del chat: antes de actuar, contrasta las señales de alarma con la conversación.
          Cada vez que abres una consulta queda registrado.
        </p>
      </div>
    </Tarjeta>
  );
}

function Conversacion({ mensajes, onCerrar }: { mensajes: MensajeTranscrito[]; onCerrar: () => void }) {
  return (
    <Tarjeta className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-brand-900">La conversación completa</h3>
        <Button variant="ghost" size="sm" onClick={onCerrar}>
          Cerrar
        </Button>
      </div>
      <ol className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
        {mensajes.map((m, i) => (
          <li
            key={i}
            className={cn(
              'rounded-xl border p-2.5 text-sm',
              m.quien === 'paciente' ? 'border-sky-200 bg-sky-50' : 'border-border/70 bg-white'
            )}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {m.quien === 'paciente' ? 'Paciente' : 'Hilda'} · {fecha(m.en, true)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-brand-900">{m.texto}</p>
          </li>
        ))}
      </ol>
    </Tarjeta>
  );
}

/** Las acciones se pueden reemplazar para ver el panel con datos de ejemplo. */
export function ConsultasAdminPanel({
  listar = listarConSesion,
  abrir = abrirConSesion,
  verChat = transcripcionConSesion,
  revisar = revisarConSesion,
}: {
  listar?: typeof listarConSesion;
  abrir?: typeof abrirConSesion;
  verChat?: typeof transcripcionConSesion;
  revisar?: typeof revisarConSesion;
}) {
  const [cola, setCola] = useState<ConsultaEnCola[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<ConsultaAbierta | null>(null);
  const [cargandoResumen, setCargandoResumen] = useState(false);
  const [chat, setChat] = useState<MensajeTranscrito[] | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const recargarCola = useCallback(async () => {
    const r = await listar();
    if (r.success) setCola(r.data);
    else setError(r.error);
  }, [listar]);

  useEffect(() => {
    recargarCola().catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la bandeja.'));
  }, [recargarCola]);

  const pendientes = useMemo(() => (cola ?? []).filter((c) => !c.revisadaEn).length, [cola]);
  const urgentes = useMemo(() => (cola ?? []).filter((c) => c.nivel === 'urgencias' && !c.revisadaEn).length, [cola]);

  async function abrirConsulta(uid: string, convId: string, forzar = false) {
    setCargandoResumen(true);
    setAviso(null);
    setError(null);
    setChat(null);
    try {
      const r = await abrir(uid, convId, forzar);
      if (r.success) {
        setAbierta(r.data);
        await recargarCola();
      } else {
        setAbierta(null);
        setError(r.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la consulta.');
    } finally {
      setCargandoResumen(false);
    }
  }

  async function mostrarChat() {
    if (!abierta) return;
    setCargandoResumen(true);
    try {
      const r = await verChat(abierta.uid, abierta.convId);
      if (r.success) setChat(r.data);
      else setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la conversación.');
    } finally {
      setCargandoResumen(false);
    }
  }

  async function guardarRevision(nota: string) {
    if (!abierta) return;
    const r = await revisar(abierta.uid, abierta.convId, nota);
    if (!r.success) {
      setError(r.error);
      return;
    }
    setAviso('Consulta marcada como revisada.');
    setAbierta({ ...abierta, nota, revisadaEn: r.data.revisadaEn, revisadaPor: abierta.revisadaPor ?? 'tú' });
    await recargarCola();
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-extrabold text-brand-900">Consultas</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Lo que pasó en teleorientación en los últimos 30 días, lo más grave primero.
          {cola && ` ${pendientes} sin revisar${urgentes ? `, ${urgentes} en urgencias` : ''}.`}
        </p>
      </header>

      {error && <MensajeError>{error}</MensajeError>}
      {aviso && (
        <p className="rounded-2xl border border-teal-200 bg-teal-50 p-3 text-sm font-semibold text-teal-800">{aviso}</p>
      )}

      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <section aria-label="Bandeja de consultas">
          {!cola ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>
          ) : cola.length === 0 ? (
            <Tarjeta className="text-center text-sm text-muted-foreground">
              <Stethoscope className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2">Ninguna consulta en los últimos 30 días.</p>
            </Tarjeta>
          ) : (
            <ul className="space-y-2">
              {cola.map((c) => (
                <FilaConsulta
                  key={`${c.uid}-${c.convId}`}
                  consulta={c}
                  activa={abierta?.uid === c.uid && abierta?.convId === c.convId}
                  onAbrir={() => abrirConsulta(c.uid, c.convId)}
                />
              ))}
            </ul>
          )}
        </section>

        <section aria-label="Resumen de la consulta" className="space-y-4">
          {cargandoResumen && !abierta ? (
            <Tarjeta className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Leyendo la consulta y armando el resumen…
            </Tarjeta>
          ) : abierta ? (
            <>
              <TarjetaResumen
                consulta={abierta}
                ocupado={cargandoResumen}
                onRegenerar={() => abrirConsulta(abierta.uid, abierta.convId, true)}
                onVerChat={mostrarChat}
                onRevisar={guardarRevision}
              />
              {chat && <Conversacion mensajes={chat} onCerrar={() => setChat(null)} />}
            </>
          ) : (
            <Tarjeta className="text-center text-sm text-muted-foreground">
              <FileText className="mx-auto h-6 w-6" />
              <p className="mt-2">Elige una consulta para ver su resumen.</p>
            </Tarjeta>
          )}
        </section>
      </div>
    </div>
  );
}
