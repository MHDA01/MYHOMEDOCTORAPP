'use client';

/**
 * Mis datos — los dos derechos de la Ley 1581 de 2012 que la persona ejerce
 * sola: llevarse una copia de todo lo suyo y pedir que no quede nada.
 *
 * El trabajo lo hacen las Server Actions de app/actions/mis-datos.ts; aquí solo
 * se arma el archivo en el navegador y se confirma el borrado. El borrado pide
 * el correo escrito a mano: no hay forma de deshacerlo.
 */

import { useContext, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Download, FileText, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { UserContext } from '@/context/user-context';
import { EncabezadoPantalla } from '@/components/dashboard/encabezado-pantalla';
import { descargarMisDatos, eliminarMiCuenta } from '@/app/actions/mis-datos';

function nombreDelArchivo(): string {
  return `mis-datos-myhomedoctorapp-${new Date().toISOString().slice(0, 10)}.json`;
}

function guardarArchivo(contenido: string, nombre: string) {
  const enlace = document.createElement('a');
  const direccion = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
  enlace.href = direccion;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(direccion);
}

export default function MisDatosPage() {
  const context = useContext(UserContext);
  const correo = context?.user?.email ?? '';

  const [descargando, setDescargando] = useState(false);
  const [descargado, setDescargado] = useState(false);
  const [errorDescarga, setErrorDescarga] = useState<string | null>(null);

  const [confirmacion, setConfirmacion] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [errorBorrado, setErrorBorrado] = useState<string | null>(null);

  const handleDescargar = async () => {
    setErrorDescarga(null);
    setDescargado(false);
    setDescargando(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');

      const resultado = await descargarMisDatos(idToken);
      if (!resultado.success) throw new Error(resultado.error);

      guardarArchivo(JSON.stringify(resultado.data, null, 2), nombreDelArchivo());
      setDescargado(true);
    } catch (error) {
      setErrorDescarga(error instanceof Error ? error.message : 'No se pudo preparar tu copia.');
    } finally {
      setDescargando(false);
    }
  };

  const handleEliminar = async () => {
    setErrorBorrado(null);
    setBorrando(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');

      const resultado = await eliminarMiCuenta(idToken, confirmacion);
      if (!resultado.success) throw new Error(resultado.error);

      // La cuenta ya no existe: se cierra la sesión del navegador y la cookie
      // del servidor, y se sale a la portada.
      if (context?.signOutUser) {
        await context.signOutUser();
      } else {
        window.location.href = '/';
      }
    } catch (error) {
      setErrorBorrado(error instanceof Error ? error.message : 'No se pudo completar el borrado.');
      setBorrando(false);
    }
  };

  const puedeEliminar =
    !borrando && confirmacion.trim().toLowerCase() === correo.trim().toLowerCase() && correo !== '';

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-8 md:px-8 md:pt-8">
      <EncabezadoPantalla
        titulo="Mis datos"
        descripcion="Lo que MyHomeDoctorApp guarda de tu familia está en tus manos."
      />

      <div className="mt-5 flex flex-col gap-4 md:mt-7">
        <section className="rounded-3xl border border-border/70 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-teal-700">
              <Download className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-brand-900">Llévate una copia de todo</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                Descarga lo que guardamos de tu cuenta: tus datos y los de tu familia, tus
                conversaciones con Hilda, tus informes y tus documentos. Es un archivo que puedes
                guardar o llevar a otro servicio.
              </p>
              <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
                <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span>
                  Si lo que buscas es un resumen para leer o llevarle a tu médico, está en{' '}
                  <Link href="/dashboard/reportes" className="font-semibold text-primary hover:underline">
                    Mis informes
                  </Link>
                  .
                </span>
              </p>
            </div>
          </div>

          {errorDescarga && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p>{errorDescarga}</p>
            </div>
          )}

          {descargado && !errorDescarga && (
            <p className="mt-4 rounded-2xl bg-emerald-50 p-3 text-sm text-emerald-800">
              Tu copia se descargó. Guárdala en un lugar seguro: trae datos de salud de tu familia.
            </p>
          )}

          <button
            type="button"
            onClick={handleDescargar}
            disabled={descargando}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-6 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {descargando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Preparando tu copia...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" /> Descargar mis datos
              </>
            )}
          </button>
        </section>

        <section className="rounded-3xl border border-red-200 bg-white p-5 shadow-soft sm:p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <Trash2 className="h-6 w-6" />
            </span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-brand-900">Borrar mi cuenta y mis datos</h2>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">
                Se borra todo: tu cuenta, los perfiles de tu familia, sus historias, tus
                conversaciones con Hilda, tus informes y tus documentos. No se puede deshacer y no
                hay copia que podamos devolverte después.
              </p>
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
              <span>Descarga primero tu copia si quieres conservar algo: después ya no se puede.</span>
            </li>
            <li className="flex items-start gap-2">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-red-400" />
              <span>
                Si más adelante vuelves a registrarte será una cuenta nueva, con las condiciones de
                acceso que haya en ese momento.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
              <span>
                Solo se conserva la constancia de qué profesional abrió una consulta y cuándo, sin
                ningún dato de salud: es el registro de quién vio tus datos.
              </span>
            </li>
          </ul>

          <label className="mt-5 block text-sm font-semibold text-brand-900" htmlFor="confirmacion">
            Para confirmar, escribe tu correo: <span className="font-normal text-muted-foreground">{correo || '—'}</span>
          </label>
          <input
            id="confirmacion"
            type="email"
            autoComplete="off"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder={correo || 'tu correo'}
            className="mt-2 h-12 w-full rounded-2xl border border-border bg-white px-4 text-[15px] text-foreground outline-none transition-colors focus:border-primary"
          />

          {errorBorrado && (
            <div className="mt-4 flex items-start gap-2 rounded-2xl bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <p>{errorBorrado}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleEliminar}
            disabled={!puedeEliminar}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-red-600 px-6 text-[15px] font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {borrando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Borrando...
              </>
            ) : (
              'Borrar mi cuenta y todos mis datos'
            )}
          </button>
        </section>
      </div>
    </div>
  );
}
