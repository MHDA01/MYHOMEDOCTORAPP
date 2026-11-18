'use client';

/**
 * Administración → Protocolos → Base de reglas.
 *
 * La pantalla desde la que una regla aprobada empieza a decidir en producción, y
 * desde la que se apaga. Tres bloques, en el orden en que importan:
 *
 * 1. **Qué está decidiendo hoy.** Lo primero y lo más grande, porque el estado
 *    que esta pantalla existe para hacer visible es el invisible: una base
 *    publicada que NO pasa las revisiones deja al grafo corriendo en vacío,
 *    exactamente igual que si no hubiera nada, y desde la app no se nota.
 * 2. **Las reglas, en palabras.** El diseño dice que el activador se revisa en
 *    medio minuto; eso exige leerlo en español y no en JSON.
 * 3. **Publicar otra base**, en dos pasos: revisar y después confirmar. Entre
 *    los dos se ve lo que entra, lo que sale y lo que cambia. Lo que importa es
 *    lo que SALE: publicar es un acto sobre la base completa, así que un
 *    documento pegado sin una alarma la retira sin decir nada.
 *
 * Lo que aquí no hay: un botón de "aprobar". La firma del médico viaja dentro de
 * cada regla y la pone quien prepara la base; un botón que la pusiera sería una
 * firma del panel.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileJson,
  Loader2,
  PowerOff,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { auth } from '@/lib/firebase';
import {
  publicarBaseDeReglasAdmin,
  retirarBaseDeReglasAdmin,
  revisarBaseCandidataAdmin,
  verBaseDeReglasAdmin,
  type RevisionCandidata,
} from '@/app/actions/admin-reglas';
import { type DiagnosticoBase } from '@/lib/base-de-reglas-guardada';
import { baseEnPalabras, type ReglaEnPalabras } from '@/lib/reglas-en-palabras';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Etiqueta, MensajeError, Tarjeta, fecha } from './piezas';

async function token(): Promise<string> {
  const t = await auth.currentUser?.getIdToken();
  if (!t) throw new Error('Inicia sesión de nuevo.');
  return t;
}

/** Acciones del panel; se pueden reemplazar para verlo con datos de ejemplo. */
export const accionesReglas = {
  ver: async () => verBaseDeReglasAdmin(await token()),
  revisar: async (texto: string) => revisarBaseCandidataAdmin(await token(), texto),
  publicar: async (texto: string, nota: string) => publicarBaseDeReglasAdmin(await token(), texto, nota),
  retirar: async () => retirarBaseDeReglasAdmin(await token()),
};

// ─────────────────────────────────────────────────────────────
// Piezas de esta pantalla
// ─────────────────────────────────────────────────────────────

function Estado({ d }: { d: DiagnosticoBase }) {
  if (!d.hayDocumento) {
    return (
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <ShieldAlert className="h-5 w-5" />
        </span>
        <div>
          <p className="font-bold text-brand-900">No hay ninguna base publicada</p>
          <p className="mt-1 text-sm text-muted-foreground">
            El grafo recorre cada turno de la consulta y no dispara nada. Es el estado correcto
            mientras el médico responsable no haya aprobado una regla: lo que no está aprobado no se
            comporta.
          </p>
        </div>
      </div>
    );
  }

  if (!d.enUso) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="font-bold text-red-800">Hay una base publicada y NO se está usando</p>
            <p className="mt-1 text-sm text-muted-foreground">
              No pasa las revisiones, así que la consulta corre en vacío igual que si no hubiera
              nada. Desde la app no se nota: hay que corregirla y volver a publicarla.
            </p>
          </div>
        </div>
        <ul className="space-y-1.5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {d.problemas.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden>•</span>
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <div>
        <p className="font-bold text-brand-900">La base está en uso</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Estas reglas corren en cada turno de cada consulta y pueden escalar a urgencias.
        </p>
      </div>
    </div>
  );
}

function Conteos({ d }: { d: DiagnosticoBase }) {
  const filas = [
    ['Alarmas', d.base.alarmas.length],
    ['Activadores', d.base.activadores.length],
    ['Síndromes', d.base.sindromes.length],
    ['Susceptibilidades', d.base.susceptibilidades.length],
    ['Escalas', d.base.escalas.length],
    ['Árboles', d.base.arboles.length],
  ] as const;

  return (
    <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {filas.map(([nombre, n]) => (
        <div key={nombre} className="rounded-xl border border-border/70 bg-white p-3">
          <dt className="text-xs font-semibold text-muted-foreground">{nombre}</dt>
          <dd className="mt-0.5 text-xl font-extrabold text-brand-900">{n}</dd>
        </div>
      ))}
    </dl>
  );
}

function Regla({ r }: { r: ReglaEnPalabras }) {
  return (
    <li className="rounded-2xl border border-border/70 bg-white p-4">
      <div className="flex flex-wrap items-baseline gap-2">
        <p className="font-bold text-brand-900">{r.titulo}</p>
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{r.id}</code>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-slate-700">
        {r.lineas.map((linea, i) => (
          <li key={i}>{linea}</li>
        ))}
      </ul>
      <p className="mt-2.5 text-xs text-muted-foreground">
        {r.fuente} · Firma: {r.firma}
      </p>
    </li>
  );
}

function ListaDeCambios({ revision }: { revision: RevisionCandidata }) {
  const c = revision.cambios;
  if (!c) return null;

  if (c.sinCambios) {
    return (
      <p className="rounded-2xl border border-border/70 bg-slate-50 p-4 text-sm text-slate-700">
        Esta base es idéntica a la que ya está publicada: no cambiaría nada.
      </p>
    );
  }

  const grupos = [
    { titulo: 'Sale', reglas: c.salen, tono: 'malo' as const, nota: 'Deja de decidir' },
    { titulo: 'Cambia', reglas: c.cambian, tono: 'aviso' as const, nota: 'Decide distinto de hoy' },
    { titulo: 'Entra', reglas: c.entran, tono: 'ok' as const, nota: 'Empieza a decidir' },
  ].filter((g) => g.reglas.length);

  return (
    <div className="space-y-3">
      {revision.peso === 'quita_alarma' && (
        <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-bold">Esta publicación retira una alarma.</p>
          <p className="mt-1">
            Una alarma corre en cada turno por encima de todo lo demás y es la salida de un árbol que
            se volvió jaula. Si no es a propósito, revisa que el documento traiga todas las que ya
            estaban.
          </p>
        </div>
      )}
      {grupos.map((g) => (
        <div key={g.titulo}>
          <div className="flex items-center gap-2">
            <Etiqueta tono={g.tono}>
              {g.titulo} · {g.reglas.length}
            </Etiqueta>
            <span className="text-xs text-muted-foreground">{g.nota}</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {g.reglas.map((r) => (
              <li key={`${r.clase}-${r.id}`} className="text-sm text-slate-700">
                <span className="font-semibold">{r.comoSeLlama}:</span> {r.titulo}{' '}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs text-slate-600">{r.id}</code>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{c.iguales} regla(s) siguen igual.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// La pantalla
// ─────────────────────────────────────────────────────────────

export function BaseDeReglasAdminPanel({ acciones = accionesReglas }: { acciones?: typeof accionesReglas }) {
  const { toast } = useToast();
  const [diag, setDiag] = useState<DiagnosticoBase | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [nota, setNota] = useState('');
  const [revision, setRevision] = useState<RevisionCandidata | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [confirmarPublicar, setConfirmarPublicar] = useState(false);
  const [confirmarRetirar, setConfirmarRetirar] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await acciones.ver();
      if (!r.success) return setError(r.error);
      setDiag(r.data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la base de reglas.');
    }
  }, [acciones]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cualquier cambio en el documento invalida la revisión: confirmar una
  // publicación contra unos cambios que ya no son los de este texto sería
  // justamente el fallo que los dos pasos existen para evitar.
  const cambiarTexto = (v: string) => {
    setTexto(v);
    setRevision(null);
  };

  const revisar = async () => {
    setRevisando(true);
    try {
      const r = await acciones.revisar(texto);
      if (!r.success) {
        setRevision(null);
        toast({ variant: 'destructive', title: 'No se pudo revisar', description: r.error });
        return;
      }
      setRevision(r.data);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'No se pudo revisar',
        description: e instanceof Error ? e.message : 'Error inesperado.',
      });
    } finally {
      setRevisando(false);
    }
  };

  const publicar = async () => {
    setPublicando(true);
    try {
      const r = await acciones.publicar(texto, nota);
      if (!r.success) {
        toast({ variant: 'destructive', title: 'No se publicó', description: r.error });
        return;
      }
      toast({ title: 'Base publicada', description: 'El próximo turno de cada consulta ya la usa.' });
      setRevision(null);
      setTexto('');
      setNota('');
      await cargar();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'No se publicó',
        description: e instanceof Error ? e.message : 'Error inesperado.',
      });
    } finally {
      setPublicando(false);
      setConfirmarPublicar(false);
    }
  };

  const retirar = async () => {
    try {
      const r = await acciones.retirar();
      if (!r.success) {
        toast({ variant: 'destructive', title: 'No se pudo retirar', description: r.error });
        return;
      }
      toast({ title: 'Base retirada', description: 'El grafo vuelve a correr en vacío.' });
      await cargar();
    } finally {
      setConfirmarRetirar(false);
    }
  };

  if (error) return <MensajeError>{error}</MensajeError>;
  if (!diag) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    );
  }

  const enPalabras = baseEnPalabras(diag.base).filter((c) => c.reglas.length);
  const puedePublicar = Boolean(revision && revision.problemas.length === 0 && !publicando);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-extrabold text-brand-900">Base de reglas del grafo</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Lo que la Dra. Hilda decide de forma determinista, sin pasar por el modelo: alarmas que
          corren en cada turno, sospechas, síndromes y árboles de preguntas. Se publica desde aquí y
          empieza a correr en el turno siguiente, sin desplegar la aplicación.
        </p>
      </header>

      <Tarjeta className="space-y-4">
        <Estado d={diag} />
        {diag.hayDocumento && (
          <>
            <Conteos d={diag} />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
              <p>
                Publicada por {diag.publicadaPor ?? '—'} · {fecha(diag.publicadaEn, true)}
                {diag.nota ? ` · "${diag.nota}"` : ''}
              </p>
              <Button variant="outline" size="sm" onClick={() => setConfirmarRetirar(true)}>
                <PowerOff className="mr-1.5 h-4 w-4" />
                Retirar la base
              </Button>
            </div>
          </>
        )}
      </Tarjeta>

      {diag.enUso && enPalabras.length > 0 && (
        <Tarjeta className="space-y-5">
          <div>
            <h2 className="font-bold text-brand-900">Lo que está decidiendo hoy</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              En palabras, para poder leer cada regla sin leer el documento. Aquí sí se nombran
              sospechas y síndromes: esta pantalla no la ve ningún paciente.
            </p>
          </div>
          {enPalabras.map((grupo) => (
            <section key={grupo.clase}>
              <h3 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
                {grupo.plural} · {grupo.reglas.length}
              </h3>
              <ul className="mt-2 space-y-2">
                {grupo.reglas.map((r) => (
                  <Regla key={r.id} r={r} />
                ))}
              </ul>
            </section>
          ))}
        </Tarjeta>
      )}

      <Tarjeta className="space-y-4">
        <div>
          <h2 className="flex items-center gap-2 font-bold text-brand-900">
            <FileJson className="h-4 w-4" />
            Publicar otra base
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            La base entera, en JSON, con la fuente y la firma del médico responsable dentro de cada
            regla. Se revisa primero y se publica después: nada se escribe hasta que confirmes.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-json">Documento de la base</Label>
          <Textarea
            id="base-json"
            value={texto}
            onChange={(e) => cambiarTexto(e.target.value)}
            rows={12}
            spellCheck={false}
            placeholder={'{\n  "alarmas": [],\n  "activadores": []\n}'}
            className="font-mono text-xs"
          />
          {diag.json && (
            <button
              type="button"
              onClick={() => cambiarTexto(diag.json as string)}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Partir de la que está publicada
            </button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="base-nota">Nota (opcional)</Label>
          <Input
            id="base-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Qué cambia y por qué"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={revisar} disabled={revisando || !texto.trim()} variant="outline">
            {revisando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Revisar
          </Button>
          <Button onClick={() => setConfirmarPublicar(true)} disabled={!puedePublicar}>
            Publicar
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          {revision?.problemas.length === 0 && (
            <span className="flex items-center gap-1.5 text-sm font-semibold text-teal-800">
              <CheckCircle2 className="h-4 w-4" />
              Pasa las dos revisiones
            </span>
          )}
        </div>

        {revision && revision.problemas.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-bold text-red-800">
              {revision.problemas.length} problema(s). Esta base no se puede publicar.
            </p>
            <ul className="space-y-1 text-sm text-red-800">
              {revision.problemas.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden>•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {revision && revision.problemas.length === 0 && <ListaDeCambios revision={revision} />}
      </Tarjeta>

      <Dialog open={confirmarPublicar} onOpenChange={setConfirmarPublicar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Publicar esta base de reglas?</DialogTitle>
            <DialogDescription>
              Empieza a decidir en el turno siguiente de cada consulta, en producción, y puede
              escalar a urgencias. Se puede retirar desde esta misma pantalla.
            </DialogDescription>
          </DialogHeader>
          {revision?.cambios && (
            <p className="text-sm text-slate-700">
              Entran {revision.cambios.entran.length}, salen {revision.cambios.salen.length} y
              cambian {revision.cambios.cambian.length}.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarPublicar(false)}>
              Cancelar
            </Button>
            <Button onClick={publicar} disabled={publicando}>
              {publicando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Sí, publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarRetirar} onOpenChange={setConfirmarRetirar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Retirar la base de reglas?</DialogTitle>
            <DialogDescription>
              El grafo vuelve a correr en vacío: deja de decidir todo el expediente determinista, no
              una regla. Para quitar una sola, publica la base sin ella. El detector de frases del
              chat sigue funcionando.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarRetirar(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={retirar}>
              Sí, retirar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
