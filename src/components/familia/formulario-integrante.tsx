'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { saveFamilyMember, saveTitularProfile } from '@/app/actions/family';
import type { FamilyProfile } from '@/lib/types';
import { listaDesdeTexto, PARENTESCOS, SEGURIDAD_SOCIAL } from '@/lib/familia';
import { buscarEps, epsDelRegimen, EPS_OTRA, pideEps } from '@/lib/eps-colombia';
import { municipiosOrdenados, MUNICIPIO_OTRO } from '@/lib/municipios-colombia';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

// Los selectores son nativos a propósito: el desplegable de Radix queda detrás de este panel
// y en el celular el selector del sistema es más cómodo.
const CLASE_SELECT =
  'h-11 w-full rounded-xl border border-input bg-white px-3 text-[15px] text-brand-900 focus:outline-none focus:ring-2 focus:ring-ring';

function Campo({ etiqueta, ayuda, children }: { etiqueta: string; ayuda?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold text-brand-900">{etiqueta}</span>
      <span className="mt-1.5 block">{children}</span>
      {ayuda && <span className="mt-1 block text-xs text-muted-foreground">{ayuda}</span>}
    </label>
  );
}

type Formulario = {
  firstName: string;
  lastName: string;
  relationship: string;
  /** Vacío mientras nadie lo haya elegido: el sexo no se supone. */
  sex: 'male' | 'female' | 'other' | '';
  dateOfBirth: string;
  weight: string;
  country: string;
  insuranceProvider: string;
  insuranceProviderName: string;
  /** EPS de la lista cerrada, o 'otra'. Solo Colombia. */
  epsId: string;
  /** Municipio donde vive, para la pantalla de urgencias. Solo Colombia. */
  municipioId: string;
  deceased: boolean;
  allergies: string;
  medications: string;
  pathologicalHistory: string;
  surgicalHistory: string;
  gynecologicalHistory: string;
  familyHistory: string;
};

const VACIO: Formulario = {
  firstName: '',
  lastName: '',
  relationship: '',
  sex: '',
  dateOfBirth: '',
  weight: '',
  country: 'colombia',
  insuranceProvider: '',
  insuranceProviderName: '',
  epsId: '',
  municipioId: '',
  deceased: false,
  allergies: '',
  medications: '',
  pathologicalHistory: '',
  surgicalHistory: '',
  gynecologicalHistory: '',
  familyHistory: '',
};

function desdePersona(p: FamilyProfile): Formulario {
  return {
    firstName: p.firstName || '',
    lastName: p.lastName || '',
    relationship: p.esTitular ? 'Titular' : p.relationship || '',
    // Una ficha vieja sin sexo registrado abre el selector en "Selecciona…".
    sex: p.sex ?? '',
    dateOfBirth: p.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(p.dateOfBirth) ? p.dateOfBirth : '',
    weight: p.weight ? String(p.weight) : '',
    country: p.country || 'colombia',
    insuranceProvider: p.insuranceProvider || '',
    insuranceProviderName: p.insuranceProviderName || '',
    // Migración suave de las fichas viejas, que traen la EPS escrita a mano: se
    // intenta casar ese texto con la lista y, si no casa, queda como "Otra" con
    // el nombre que la persona escribió. Nunca se elige una EPS por parecido.
    epsId: p.epsId || (p.insuranceProviderName ? buscarEps(p.insuranceProviderName)?.id ?? EPS_OTRA : ''),
    municipioId: p.municipioId || '',
    deceased: Boolean(p.deceased),
    allergies: (p.allergies || []).join(', '),
    medications: (p.medications || []).join(', '),
    pathologicalHistory: p.pathologicalHistory || '',
    surgicalHistory: p.surgicalHistory || '',
    gynecologicalHistory: p.gynecologicalHistory || '',
    familyHistory: p.familyHistory || '',
  };
}

/** ¿Hay algo guardado en los campos que van en "Más datos"? */
function tieneMasDatos(p: FamilyProfile): boolean {
  return Boolean(
    p.weight ||
      p.insuranceProvider ||
      p.epsId ||
      p.municipioId ||
      p.deceased ||
      p.pathologicalHistory ||
      p.surgicalHistory ||
      p.gynecologicalHistory ||
      p.familyHistory
  );
}

/** Panel para agregar o editar a una persona de la familia (o al titular). */
export function FormularioIntegrante({
  abierto,
  persona,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  /** null = agregar un familiar nuevo. */
  persona: FamilyProfile | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState<Formulario>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [masDatos, setMasDatos] = useState(false);
  const titular = Boolean(persona?.esTitular);

  useEffect(() => {
    if (abierto) {
      setF(persona ? desdePersona(persona) : VACIO);
      setError(null);
      // Al editar, si la persona ya tiene alguno de los datos opcionales, se muestran de una vez.
      setMasDatos(Boolean(persona && tieneMasDatos(persona)));
    }
  }, [abierto, persona]);

  const poner = <K extends keyof Formulario>(campo: K, valor: Formulario[K]) => setF((previo) => ({ ...previo, [campo]: valor }));
  const seguridad = SEGURIDAD_SOCIAL[f.country] ?? SEGURIDAD_SOCIAL.colombia;
  const hoy = new Date().toISOString().slice(0, 10);

  // La lista cerrada de EPS y de municipios es colombiana. En Chile y Argentina
  // el campo sigue siendo el de antes: no hay lista que ofrecer y no se finge una.
  const esColombia = f.country === 'colombia';
  const ofreceEps = esColombia && pideEps(f.insuranceProvider);
  const epsPosibles = ofreceEps ? epsDelRegimen(f.insuranceProvider) : [];
  const pideNombreAMano = ofreceEps
    ? f.epsId === EPS_OTRA
    : seguridad.pideNombre.includes(f.insuranceProvider);

  const guardar = async () => {
    // El sexo entra aquí desde el 8-nov-2026: antes el formulario traía "Mujer"
    // preseleccionado, así que una ficha guardada sin tocar ese campo quedaba
    // con un sexo que nadie contestó.
    if (!f.firstName.trim() || !f.lastName.trim() || !f.dateOfBirth || !f.sex || (!titular && !f.relationship)) {
      setError('Completa nombres, apellidos, fecha de nacimiento, sexo' + (titular ? '.' : ' y parentesco.'));
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Tu sesión expiró. Vuelve a ingresar.');

      const comunes = {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        sex: f.sex,
        dateOfBirth: f.dateOfBirth,
        ...(f.weight ? { weight: Number(f.weight) } : {}),
        insuranceProvider: f.insuranceProvider,
        // El nombre escrito a mano solo viaja cuando hace falta: si la EPS salió
        // de la lista, el nombre lo da la lista y guardar las dos cosas abre la
        // puerta a que no digan lo mismo.
        insuranceProviderName: pideNombreAMano ? f.insuranceProviderName.trim() : '',
        epsId: ofreceEps ? f.epsId : '',
        municipioId: esColombia ? f.municipioId : '',
        allergies: listaDesdeTexto(f.allergies),
        medications: listaDesdeTexto(f.medications),
        pathologicalHistory: f.pathologicalHistory.trim(),
        surgicalHistory: f.surgicalHistory.trim(),
        gynecologicalHistory: f.sex === 'female' ? f.gynecologicalHistory.trim() : '',
      };

      const resultado = titular
        ? await saveTitularProfile(idToken, { ...comunes, country: f.country })
        : await saveFamilyMember(idToken, persona?.id ?? null, {
            ...comunes,
            country: f.country,
            relationship: f.relationship,
            esTitular: false,
            deceased: f.deceased,
            familyHistory: f.familyHistory.trim(),
          });

      if (!resultado.success) throw new Error(resultado.error);
      onGuardado();
    } catch (e) {
      console.error('[Familia] Error guardando:', e);
      setError('No se pudo guardar. Revisa los datos e intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Sheet open={abierto} onOpenChange={(v) => !v && !guardando && onCerrar()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/70 p-5 pr-12">
          <SheetTitle className="text-brand-900">{persona ? (titular ? 'Editar mi perfil' : 'Editar familiar') : 'Agregar familiar'}</SheetTitle>
          <SheetDescription>
            {titular ? 'Tus datos y tu historial de salud.' : 'Lo que registres aparece en el familiograma y en su informe.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Nombres">
              <Input value={f.firstName} onChange={(e) => poner('firstName', e.target.value)} maxLength={100} autoComplete="off" />
            </Campo>
            <Campo etiqueta="Apellidos">
              <Input value={f.lastName} onChange={(e) => poner('lastName', e.target.value)} maxLength={100} autoComplete="off" />
            </Campo>
          </div>

          {!titular && (
            <Campo etiqueta="Parentesco contigo">
              <select className={CLASE_SELECT} value={f.relationship} onChange={(e) => poner('relationship', e.target.value)}>
                <option value="">Selecciona…</option>
                {/* Un parentesco escrito a mano en el sistema anterior se conserva */}
                {f.relationship && !(PARENTESCOS as readonly string[]).includes(f.relationship) && (
                  <option value={f.relationship}>{f.relationship}</option>
                )}
                {PARENTESCOS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Campo>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Campo etiqueta="Sexo">
              <select className={CLASE_SELECT} value={f.sex} onChange={(e) => poner('sex', e.target.value as Formulario['sex'])}>
                <option value="">Selecciona…</option>
                <option value="female">Mujer</option>
                <option value="male">Hombre</option>
                <option value="other">Otro</option>
              </select>
            </Campo>
            <Campo etiqueta="Fecha de nacimiento">
              <Input type="date" value={f.dateOfBirth} min="1900-01-01" max={hoy} onChange={(e) => poner('dateOfBirth', e.target.value)} />
            </Campo>
          </div>

          <Campo etiqueta="Alergias" ayuda="Sepáralas con comas. Ej.: penicilina, maní">
            <Input value={f.allergies} onChange={(e) => poner('allergies', e.target.value)} />
          </Campo>
          <Campo etiqueta="Medicamentos frecuentes" ayuda="Sepáralos con comas. Ej.: losartán 50 mg, aspirina">
            <Input value={f.medications} onChange={(e) => poner('medications', e.target.value)} />
          </Campo>

          <button
            type="button"
            onClick={() => setMasDatos((v) => !v)}
            aria-expanded={masDatos}
            className="flex w-full items-center justify-between rounded-2xl bg-sky-50 px-4 py-3 text-left text-sm font-semibold text-brand-900 transition-colors hover:bg-sky-100"
          >
            <span>
              Más datos
              <span className="block text-xs font-normal text-muted-foreground">Peso, seguridad social y antecedentes (opcionales)</span>
            </span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', masDatos && 'rotate-180')} />
          </button>

          {masDatos && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Peso (kg)" ayuda="Opcional">
                  <Input type="number" inputMode="decimal" min={0} max={500} step="0.1" value={f.weight} onChange={(e) => poner('weight', e.target.value)} />
                </Campo>
                <Campo etiqueta="País">
                  <select
                    className={CLASE_SELECT}
                    value={f.country}
                    onChange={(e) => setF((p) => ({ ...p, country: e.target.value, insuranceProvider: '', insuranceProviderName: '' }))}
                  >
                    <option value="colombia">Colombia</option>
                    <option value="chile">Chile</option>
                    <option value="argentina">Argentina</option>
                  </select>
                </Campo>
              </div>

              <Campo etiqueta={seguridad.etiqueta}>
                <select
                  className={CLASE_SELECT}
                  value={f.insuranceProvider}
                  onChange={(e) => setF((p) => ({ ...p, insuranceProvider: e.target.value, epsId: '', insuranceProviderName: '' }))}
                >
                  <option value="">Sin registrar</option>
                  {seguridad.opciones.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Campo>

              {ofreceEps && (
                <Campo etiqueta="¿Cuál EPS?" ayuda="Es la que aparece en el carné. Queda en la ficha de salud y en el informe.">
                  <select
                    className={CLASE_SELECT}
                    value={f.epsId}
                    onChange={(e) => setF((p) => ({ ...p, epsId: e.target.value, insuranceProviderName: '' }))}
                  >
                    <option value="">Sin registrar</option>
                    {epsPosibles.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                    <option value={EPS_OTRA}>Otra (no está en la lista)</option>
                  </select>
                </Campo>
              )}

              {pideNombreAMano && (
                <Campo etiqueta="¿Cuál?">
                  <Input value={f.insuranceProviderName} onChange={(e) => poner('insuranceProviderName', e.target.value)} maxLength={200} />
                </Campo>
              )}

              {esColombia && (
                <Campo etiqueta="Municipio donde vive" ayuda="Opcional. Queda en la ficha de salud.">
                  <select className={CLASE_SELECT} value={f.municipioId} onChange={(e) => poner('municipioId', e.target.value)}>
                    <option value="">Sin registrar</option>
                    {municipiosOrdenados().map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.nombre}
                        {m.departamento !== m.nombre ? ` — ${m.departamento}` : ''}
                      </option>
                    ))}
                    <option value={MUNICIPIO_OTRO}>Otro municipio</option>
                  </select>
                </Campo>
              )}

              {!titular && (
                <label className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-brand-900">
                  <input type="checkbox" className="h-5 w-5 accent-primary" checked={f.deceased} onChange={(e) => poner('deceased', e.target.checked)} />
                  Esta persona ya falleció
                </label>
              )}

              <Campo etiqueta="Antecedentes patológicos" ayuda="Enfermedades diagnosticadas (y, si falleció, de qué).">
                <Textarea rows={3} maxLength={2000} value={f.pathologicalHistory} onChange={(e) => poner('pathologicalHistory', e.target.value)} />
              </Campo>
              <Campo etiqueta="Antecedentes quirúrgicos">
                <Textarea rows={3} maxLength={2000} value={f.surgicalHistory} onChange={(e) => poner('surgicalHistory', e.target.value)} />
              </Campo>
              {f.sex === 'female' && (
                <Campo etiqueta="Antecedentes ginecológicos">
                  <Textarea rows={3} maxLength={2000} value={f.gynecologicalHistory} onChange={(e) => poner('gynecologicalHistory', e.target.value)} />
                </Campo>
              )}
              {!titular && (
                <Campo etiqueta="Antecedentes familiares" ayuda="Enfermedades frecuentes en la familia de esta persona.">
                  <Textarea rows={3} maxLength={2000} value={f.familyHistory} onChange={(e) => poner('familyHistory', e.target.value)} />
                </Campo>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border/70 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onCerrar}
              disabled={guardando}
              className="inline-flex h-12 flex-1 items-center justify-center rounded-full border border-border bg-white text-[15px] font-semibold text-brand-900 hover:bg-sky-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className={cn(
                'inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-primary text-[15px] font-bold text-white shadow-soft transition-colors hover:bg-primary/90 disabled:opacity-60'
              )}
            >
              {guardando ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
                </>
              ) : (
                'Guardar'
              )}
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
