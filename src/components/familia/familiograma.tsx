'use client';

import { Fragment, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, UserPlus, Users } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { deleteFamilyMember, getSecureFamilyTree } from '@/app/actions/family';
import type { FamilyProfile } from '@/lib/types';
import { armarFamiliograma, nombrePropio } from '@/lib/familia';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { FormularioIntegrante } from './formulario-integrante';
import { SimboloFamiliograma } from './simbolo-familiograma';
import { TarjetaIntegrante } from './tarjeta-integrante';

function Tallo() {
  return <div aria-hidden className="mx-auto my-4 h-6 w-0.5 rounded-full bg-border" />;
}

function LeyendaSimbolos() {
  return (
    <details className="group text-xs text-muted-foreground">
      <summary className="cursor-pointer list-none font-semibold text-brand-800 hover:text-primary [&::-webkit-details-marker]:hidden">
        ¿Cómo se lee? <span className="font-normal group-open:hidden">Ver símbolos</span>
      </summary>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl bg-white p-3 shadow-soft ring-1 ring-border/70">
        <span className="inline-flex items-center gap-1.5">
          <SimboloFamiliograma sexo="male" className="h-6 w-6" /> Hombre
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SimboloFamiliograma sexo="female" className="h-6 w-6" /> Mujer
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SimboloFamiliograma sexo="other" className="h-6 w-6" /> Otro
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SimboloFamiliograma sexo="female" titular className="h-6 w-6" /> Tú
        </span>
        <span className="inline-flex items-center gap-1.5">
          <SimboloFamiliograma sexo="male" fallecido className="h-6 w-6" /> Fallecido/a
        </span>
        <p className="w-full leading-relaxed">
          El número dentro es la edad. Las personas se ordenan por su parentesco contigo: las líneas unen parejas y generaciones, no indican de qué
          lado de la familia es cada abuelo o tío.
        </p>
      </div>
    </details>
  );
}

/** Las generaciones con sus tarjetas. Sin acceso a datos: recibe a la familia ya leída. */
export function FamiliogramaVista({
  familia,
  onEditar,
  onEliminar,
}: {
  familia: FamilyProfile[];
  onEditar: (persona: FamilyProfile) => void;
  onEliminar: (persona: FamilyProfile) => void;
}) {
  const filas = useMemo(() => armarFamiliograma(familia), [familia]);
  return (
    <div className="flex flex-col">
      {filas.map((fila, i) => (
        <Fragment key={fila.nivel}>
          {i > 0 && <Tallo />}
          <section aria-label={fila.etiqueta}>
            <h2 className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">{fila.etiqueta}</h2>
            <div className="flex flex-wrap items-start justify-center gap-4">
              {fila.grupos.map((grupo, g) => (
                <div
                  key={g}
                  className={
                    grupo.esPareja ? 'flex w-full flex-col items-center sm:w-auto sm:flex-row sm:items-start' : 'flex w-full justify-center sm:w-auto'
                  }
                >
                  {grupo.personas.map((p, k) => (
                    <Fragment key={p.persona.id}>
                      {k > 0 && (
                        <div aria-hidden className="flex items-center justify-center py-1 sm:mt-[38px] sm:px-1 sm:py-0">
                          <div className="h-5 w-0.5 rounded-full bg-brand-800/40 sm:h-0.5 sm:w-6" />
                        </div>
                      )}
                      <TarjetaIntegrante persona={p.persona} onEditar={onEditar} onEliminar={onEliminar} />
                    </Fragment>
                  ))}
                </div>
              ))}
            </div>
          </section>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Familiograma: la familia ordenada por generaciones, cada persona con todos sus datos,
 * y desde aquí se agrega, edita o elimina a cada integrante.
 */
export function Familiograma() {
  const context = useContext(UserContext);
  const userId = context?.user?.uid;
  const recargarPerfil = context?.recargarPerfil;

  const [familia, setFamilia] = useState<FamilyProfile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ abierto: boolean; persona: FamilyProfile | null }>({ abierto: false, persona: null });
  const [porEliminar, setPorEliminar] = useState<FamilyProfile | null>(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesión expirada');
      const resultado = await getSecureFamilyTree(idToken);
      if (!resultado.success) throw new Error(resultado.error);
      setFamilia(resultado.members);
      setError(null);
    } catch (e) {
      console.error('[Familia] Error cargando el familiograma:', e);
      setError('No se pudo cargar tu familia. Revisa tu conexión e intenta de nuevo.');
    }
  }, [userId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const soloElTitular = familia !== null && familia.length <= 1;

  const abrirFormulario = (persona: FamilyProfile | null) => setFormulario({ abierto: true, persona });

  const alGuardar = async () => {
    const eraTitular = formulario.persona?.esTitular;
    setFormulario({ abierto: false, persona: null });
    await cargar();
    // El resto de la app (informe, saludo) lee al titular del contexto: se refresca con el cambio.
    if (eraTitular) await recargarPerfil?.();
  };

  const eliminar = async () => {
    if (!porEliminar) return;
    setEliminando(true);
    setErrorEliminar(null);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesión expirada');
      const resultado = await deleteFamilyMember(idToken, porEliminar.id);
      if (!resultado.success) throw new Error(resultado.error);
      setPorEliminar(null);
      await cargar();
    } catch (e) {
      console.error('[Familia] Error eliminando:', e);
      setErrorEliminar('No se pudo eliminar. Intenta de nuevo.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <div className="mt-5 flex flex-col gap-4 md:mt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {familia ? `${familia.length} ${familia.length === 1 ? 'persona' : 'personas'} en tu grupo familiar` : 'Cargando…'}
          </p>
          <button
            type="button"
            onClick={() => abrirFormulario(null)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-[15px] font-bold text-white shadow-soft transition-colors hover:bg-primary/90 active:scale-[0.98]"
          >
            <UserPlus className="h-4 w-4" /> Agregar familiar
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <div>
              <p>{error}</p>
              <button type="button" onClick={cargar} className="mt-1 font-semibold underline">
                Reintentar
              </button>
            </div>
          </div>
        )}

        {!familia && !error && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Armando tu familiograma…
          </div>
        )}

        {familia && (
          <>
            <LeyendaSimbolos />

            {soloElTitular && (
              <div className="flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-sm text-brand-900">
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <p>Agrega a tus padres, pareja, hijos o hermanos y se ordenan solos por generaciones.</p>
              </div>
            )}

            <FamiliogramaVista
              familia={familia}
              onEditar={abrirFormulario}
              onEliminar={(persona) => {
                setErrorEliminar(null);
                setPorEliminar(persona);
              }}
            />
          </>
        )}
      </div>

      <FormularioIntegrante
        abierto={formulario.abierto}
        persona={formulario.persona}
        onCerrar={() => setFormulario({ abierto: false, persona: null })}
        onGuardado={alGuardar}
      />

      <AlertDialog open={porEliminar !== null} onOpenChange={(v) => !v && !eliminando && setPorEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar a {nombrePropio(porEliminar?.firstName)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra para siempre su perfil, su historial de salud, sus documentos y sus conversaciones con la Dra. Hilda. No se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {errorEliminar && (
            <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorEliminar}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={eliminando}
              className="bg-red-600 hover:bg-red-700"
              onClick={(e) => {
                e.preventDefault();
                eliminar();
              }}
            >
              {eliminando ? 'Eliminando…' : 'Sí, eliminar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
