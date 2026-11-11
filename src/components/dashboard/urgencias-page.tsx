'use client';

/**
 * Urgencias en Colombia.
 *
 * Esta pantalla tuvo hasta el 11-nov-2026 un botón rojo que marcaba `tel:131`
 * ("Llamar al SAMU") y cuatro prestadores chilenos presentados como "nuestros
 * proveedores". El SAMU y el 131 son de Chile: en Colombia ese número no manda
 * una ambulancia, y la red no era nuestra ni operaba en el país. Es la única
 * pantalla de la app a la que alguien llega *durante* una emergencia, así que
 * eso era el fallo más grave que tenía la app.
 *
 * Lo que la reemplaza se rige por tres reglas:
 *
 * 1. **El 123 primero y siempre.** No depende de la EPS, ni de la ciudad, ni de
 *    que hayamos verificado nada.
 * 2. **Nada de un tercero sin fuente, sin fecha y sin aprobación.** Lo decide
 *    `directorio-urgencias.ts`; esta pantalla solo muestra lo que esa función le
 *    entrega, y cuando no hay nada **lo dice** en vez de dejar un hueco.
 * 3. **La EPS sale de la ficha de cada integrante**, no de una lista nuestra. Por
 *    eso hay selector: en una familia cada persona puede tener otra EPS.
 *
 * Los textos visibles de aquí son nuevos y están **pendientes de la aprobación de
 * Alexander**, como todo texto que el paciente lee.
 */

import Link from 'next/link';
import { useContext, useEffect, useMemo, useState } from 'react';
import { Phone, Siren, MessageCircleHeart, IdCard, ExternalLink } from 'lucide-react';
import { UserContext } from '@/context/user-context';
import { auth } from '@/lib/firebase';
import { getSecureFamilyMembers } from '@/app/actions/family';
import type { FamilyProfile } from '@/lib/types';
import { epsPorId } from '@/lib/eps-colombia';
import { municipioPorId } from '@/lib/municipios-colombia';
import { hoyEnBogota, urgenciasPara } from '@/lib/directorio-urgencias';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CLASE_SELECT =
  'h-11 w-full rounded-xl border border-input bg-white px-3 text-[15px] text-brand-900 focus:outline-none focus:ring-2 focus:ring-ring';

function nombreCompleto(p: FamilyProfile): string {
  return [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || 'Sin nombre';
}

export function UrgenciasPage() {
  const context = useContext(UserContext);
  const user = context?.user ?? null;
  const [integrantes, setIntegrantes] = useState<FamilyProfile[]>([]);
  const [elegido, setElegido] = useState<string>('');

  // La misma lectura que hacen el inicio y el chat.
  useEffect(() => {
    if (!user) return;
    let cancelado = false;
    (async () => {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) return;
        const lista = (await getSecureFamilyMembers(idToken)) as FamilyProfile[];
        const vivos = [...lista].filter((m) => !m.deceased).sort((a, b) => Number(!!b.esTitular) - Number(!!a.esTitular));
        if (!cancelado) {
          setIntegrantes(vivos);
          setElegido((previo) => previo || vivos[0]?.id || '');
        }
      } catch (error) {
        // Si la familia no carga, el 123 sigue en pantalla: es lo que importa.
        console.error('[Urgencias] Error cargando integrantes:', error);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [user]);

  const persona = useMemo(
    () => integrantes.find((m) => m.id === elegido) ?? integrantes[0] ?? null,
    [integrantes, elegido]
  );

  const hoy = hoyEnBogota();
  const datos = useMemo(
    () =>
      urgenciasPara(
        {
          epsId: persona?.epsId,
          epsDeclarada: persona?.insuranceProviderName,
          municipioId: persona?.municipioId,
        },
        hoy
      ),
    [persona, hoy]
  );

  const eps = epsPorId(persona?.epsId);
  const municipio = municipioPorId(persona?.municipioId);

  return (
    <div className="flex flex-col h-full">
      <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
        <div className="mx-auto w-full max-w-3xl space-y-6">
          {/* 1. El 123. Sin condiciones, y lo primero que se ve. */}
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Siren className="h-7 w-7 shrink-0 text-destructive" />
                <CardTitle className="font-headline text-xl">Si hay riesgo para la vida, llama al 123</CardTitle>
              </div>
              <CardDescription>
                El 123 es la línea única de emergencias en Colombia. Atiende todo el día, todos los días, y desde
                cualquier teléfono, aunque no tengas minutos ni EPS.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="destructive"
                size="lg"
                className="h-14 w-full text-lg font-bold sm:w-auto sm:px-10"
                onClick={() => {
                  window.location.href = `tel:${datos.lineaEmergencias}`;
                }}
              >
                <Phone className="mr-2 h-5 w-5" /> Llamar al {datos.lineaEmergencias}
              </Button>
            </CardContent>
          </Card>

          {/* 2. La duda. La app no decide por nadie: ofrece su propia orientación. */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <MessageCircleHeart className="h-6 w-6 shrink-0 text-primary" />
                <CardTitle className="font-headline text-lg">¿No sabes si es una urgencia?</CardTitle>
              </div>
              <CardDescription>
                Cuéntale a Hilda qué está pasando y te dice qué tan pronto hay que buscar atención y con quién. No
                reemplaza a un médico y no receta.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="secondary" className="h-12 w-full sm:w-auto">
                <Link href="/dashboard/teleorientacion">Abrir una orientación</Link>
              </Button>
            </CardContent>
          </Card>

          {/* 3. La EPS de esta persona, que sale de su ficha. */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <IdCard className="h-6 w-6 shrink-0 text-primary" />
                <CardTitle className="font-headline text-lg">A dónde acudir con tu EPS</CardTitle>
              </div>
              <CardDescription>
                La urgencia la atiende tu EPS, y cada integrante de la familia puede tener una distinta.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {integrantes.length > 1 && (
                <label className="block">
                  <span className="text-sm font-semibold text-brand-900">¿Para quién?</span>
                  <select
                    className={cn(CLASE_SELECT, 'mt-1.5')}
                    value={persona?.id ?? ''}
                    onChange={(e) => setElegido(e.target.value)}
                  >
                    {integrantes.map((m) => (
                      <option key={m.id} value={m.id}>
                        {nombreCompleto(m)}
                        {m.esTitular ? ' (tú)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <dl className="rounded-2xl bg-slate-50 p-4 text-sm">
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground">Seguridad social</dt>
                  <dd className="text-right font-semibold text-brand-900">
                    {persona?.insuranceProvider || 'Sin registrar'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground">EPS</dt>
                  <dd className="text-right font-semibold text-brand-900">
                    {eps?.nombre || datos.epsDeclarada || 'Sin registrar'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-1">
                  <dt className="text-muted-foreground">Municipio</dt>
                  <dd className="text-right font-semibold text-brand-900">{municipio?.nombre || 'Sin registrar'}</dd>
                </div>
              </dl>

              {/* Los teléfonos de la EPS, cuando hay y están aprobados y vigentes. */}
              {datos.telefonos.length > 0 && (
                <ul className="space-y-2">
                  {datos.telefonos.map((t) => (
                    <li
                      key={`${t.etiqueta}-${t.numero}`}
                      className="flex items-center justify-between gap-3 rounded-xl border p-3"
                    >
                      <div>
                        <p className="font-semibold text-brand-900">{t.etiqueta}</p>
                        <p className="text-sm text-muted-foreground">
                          {t.numero}
                          {t.horario ? ` · ${t.horario}` : ''}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => {
                          window.location.href = `tel:${t.numero.replace(/\s+/g, '')}`;
                        }}
                      >
                        <Phone className="mr-2 h-4 w-4" /> Llamar
                      </Button>
                    </li>
                  ))}
                </ul>
              )}

              {datos.sedes.length > 0 && (
                <ul className="space-y-2">
                  {datos.sedes.map((s) => (
                    <li key={`${s.nombre}-${s.direccion}`} className="rounded-xl border p-3">
                      <p className="font-semibold text-brand-900">{s.nombre}</p>
                      <p className="text-sm text-muted-foreground">{s.direccion}</p>
                    </li>
                  ))}
                </ul>
              )}

              {/* Y cuando no hay nada que mostrar, se dice por qué. */}
              {datos.motivo && (
                <p className="rounded-2xl bg-sky-50 p-4 text-sm text-brand-900">
                  {datos.motivo === 'sin_eps' ? (
                    <>
                      No tenemos registrada la EPS de esta persona.{' '}
                      <Link href="/dashboard/familia" className="font-semibold underline">
                        Agrégala en su ficha
                      </Link>{' '}
                      y aparecerá aquí. Mientras tanto, la línea de tu EPS está impresa en el carné.
                    </>
                  ) : (
                    <>
                      Todavía no mostramos la línea de tu EPS aquí: preferimos no darte un número que no hayamos
                      confirmado. La encuentras en tu carné o en la página de tu EPS. Si hay riesgo para la vida, no
                      busques: llama al {datos.lineaEmergencias}.
                    </>
                  )}
                </p>
              )}

              {datos.paginaOficial && (
                <a
                  href={datos.paginaOficial}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-primary underline"
                >
                  Página oficial de {eps?.nombre ?? 'tu EPS'} <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
