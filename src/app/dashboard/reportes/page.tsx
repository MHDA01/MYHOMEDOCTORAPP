'use client';

import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, Timestamp } from 'firebase/firestore';
import { AlertCircle, Download, FileText, Loader2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { getSecureFamilyMembers, getSecureMemberMedicalHistory } from '@/app/actions/family';
import { COLECCION_TUTOR, SUBCOLECCION_INTEGRANTES } from '@/lib/constants';
import type { DatosInformeSalud } from '@/lib/informe-salud-pdf';
import type { FamilyProfile } from '@/lib/types';
import { EncabezadoPantalla } from '@/components/dashboard/encabezado-pantalla';
import { cn } from '@/lib/utils';

/**
 * Mis informes: descarga del resumen de salud en PDF de cada persona de la familia.
 *
 * Recupera el botón "Generar Informe" que existió hasta junio de 2026 (aprobado
 * por el fundador el 15-sep-2026). Los datos de los integrantes se leen con las
 * mismas acciones del servidor que usa la app, que los devuelven descifrados; antes
 * se leían cifrados desde el navegador y alergias y antecedentes salían vacíos.
 */

type Persona = FamilyProfile & { sintetico?: boolean };

function aFecha(valor: unknown): Date | undefined {
  if (!valor) return undefined;
  if (valor instanceof Timestamp) return valor.toDate();
  if (valor instanceof Date) return valor;
  const fecha = new Date(String(valor));
  return isNaN(fecha.getTime()) ? undefined : fecha;
}

function nombrePropio(nombre: string | undefined): string {
  if (!nombre) return '';
  return nombre
    .split(' ')
    .map((p) => (p ? p.charAt(0).toLocaleUpperCase('es-CO') + p.slice(1).toLocaleLowerCase('es-CO') : p))
    .join(' ');
}

function iniciales(p: Persona): string {
  return `${p.firstName?.charAt(0) ?? ''}${p.lastName?.charAt(0) ?? ''}`.toUpperCase() || '?';
}

const esTitular = (p: Persona) => Boolean(p.esTitular) || p.relationship === 'Titular';

export default function ReportesPage() {
  const context = useContext(UserContext);
  const userId = context?.user?.uid;
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [cargando, setCargando] = useState(true);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !context?.personalInfo) return;
    let cancelado = false;
    (async () => {
      setCargando(true);
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const lista = idToken ? ((await getSecureFamilyMembers(idToken)) as Persona[]) : [];
        const conTitular = [...lista];
        if (!conTitular.some(esTitular)) {
          const info = context.personalInfo!;
          conTitular.unshift({
            id: '__tutor__',
            userId,
            firstName: info.firstName,
            lastName: info.lastName,
            sex: info.sex,
            dateOfBirth: info.dateOfBirth instanceof Date ? info.dateOfBirth.toISOString() : '',
            relationship: 'Titular',
            esTitular: true,
            sintetico: true,
          });
        }
        conTitular.sort((a, b) => Number(esTitular(b)) - Number(esTitular(a)));
        if (!cancelado) {
          setPersonas(conTitular);
          setSeleccion((previa) => previa ?? conTitular[0]?.id ?? null);
        }
      } catch (err) {
        console.error('[Mis informes] Error cargando la familia:', err);
      } finally {
        if (!cancelado) setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [userId, context?.personalInfo]);

  const personaSeleccionada = useMemo(() => personas.find((p) => p.id === seleccion) ?? null, [personas, seleccion]);

  const datosDe = useCallback(
    async (persona: Persona): Promise<DatosInformeSalud | null> => {
      if (!context?.personalInfo || !context.healthInfo || !userId) return null;

      if (esTitular(persona)) {
        return {
          personalInfo: context.personalInfo,
          healthInfo: context.healthInfo,
          appointments: context.appointments,
          medications: context.medications,
          documents: context.documents,
        };
      }

      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Sesión expirada');
      const historial = (await getSecureMemberMedicalHistory(idToken, persona.id)) ?? {};

      let documentos: DatosInformeSalud['documents'] = [];
      try {
        const snap = await getDocs(
          query(collection(db, COLECCION_TUTOR, userId, SUBCOLECCION_INTEGRANTES, persona.id, 'Documentos'), orderBy('uploadedAt', 'desc'))
        );
        documentos = snap.docs.map((d) => {
          const raw = d.data() as any;
          return { name: raw.name, category: raw.category, uploadedAt: aFecha(raw.uploadedAt) };
        });
      } catch (err) {
        console.error('[Mis informes] Error leyendo documentos del integrante:', err);
      }

      return {
        personalInfo: {
          firstName: persona.firstName,
          lastName: persona.lastName,
          sex: persona.sex,
          dateOfBirth: aFecha(persona.dateOfBirth),
          insuranceProvider: persona.insuranceProvider || '',
          insuranceProviderName: persona.insuranceProviderName || '',
        },
        healthInfo: {
          allergies: persona.allergies || [],
          medications: persona.medications || [],
          pathologicalHistory: historial.pathologicalHistory || '',
          surgicalHistory: historial.surgicalHistory || '',
          gynecologicalHistory: historial.gynecologicalHistory || '',
        },
        appointments: [],
        medications: [],
        documents: documentos,
      };
    },
    [context, userId]
  );

  const descargar = async () => {
    if (!personaSeleccionada) return;
    setError(null);
    setGenerando(true);
    try {
      const datos = await datosDe(personaSeleccionada);
      if (!datos) throw new Error('Datos incompletos');
      // La librería de PDF pesa: se carga solo al descargar.
      const { construirInformeSalud, nombreArchivoInforme } = await import('@/lib/informe-salud-pdf');
      construirInformeSalud(datos).save(nombreArchivoInforme(datos.personalInfo));
    } catch (err) {
      console.error('[Mis informes] Error generando el PDF:', err);
      setError('No se pudo generar el informe. Intenta de nuevo en unos segundos.');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 md:px-8 md:pt-8">
      <EncabezadoPantalla titulo="Mis informes" descripcion="Descarga en PDF el resumen de salud de cada persona de tu familia." />

      <section className="mt-5 rounded-3xl border border-border/70 bg-white p-5 shadow-soft sm:p-6 md:mt-7">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-primary">
            <FileText className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-brand-900">Informe de salud</h2>
            <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
              Datos personales, alergias, medicamentos, antecedentes, citas y documentos. Solo incluye lo que registraste en la app.
            </p>
          </div>
        </div>

        <h3 className="mt-6 text-sm font-bold text-brand-900">¿De quién es el informe?</h3>
        {cargando ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando tu familia...
          </div>
        ) : (
          <div role="radiogroup" aria-label="Persona del informe" className="mt-3 grid gap-2 sm:grid-cols-2">
            {personas.map((persona) => {
              const activa = persona.id === seleccion;
              return (
                <button
                  key={persona.id}
                  type="button"
                  role="radio"
                  aria-checked={activa}
                  onClick={() => setSeleccion(persona.id)}
                  className={cn(
                    'flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    activa ? 'border-primary bg-primary/5' : 'border-border/70 hover:bg-sky-50'
                  )}
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-brand-800">
                    {iniciales(persona)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-semibold text-brand-900">
                      {nombrePropio(`${persona.firstName ?? ''} ${persona.lastName ?? ''}`.trim()) || 'Sin nombre'}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{esTitular(persona) ? 'Titular' : persona.relationship}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <button
          type="button"
          onClick={descargar}
          disabled={!personaSeleccionada || generando || cargando}
          className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-bold text-primary-foreground shadow-soft transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
        >
          {generando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          {generando ? 'Generando...' : 'Descargar PDF'}
        </button>
      </section>
    </div>
  );
}
