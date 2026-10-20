'use client';

import { useEffect, useMemo, useState } from 'react';
import { Bell, Search, Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { listarUsuariosAdmin, type UsuarioAdmin } from '@/app/actions/admin-seguimiento';
import { cambiarModalidadUsuario, eliminarUsuarioAdmin } from '@/app/actions/admin-usuarios';
import { MODALIDADES, NOMBRE_MODALIDAD, type Modalidad } from '@/lib/modalidad';
import { ACCESO_LIBRE } from '@/config/acceso';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Etiqueta, MensajeError, Tarjeta, fecha, haceCuanto, numero } from './piezas';

type Orden = 'registro' | 'uso' | 'consultas';

const ORDENES: Array<{ id: Orden; nombre: string }> = [
  { id: 'registro', nombre: 'Más recientes' },
  { id: 'uso', nombre: 'Último uso' },
  { id: 'consultas', nombre: 'Más consultas' },
];

function sinTildes(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function conSesion<T>(usar: (idToken: string) => Promise<T>): Promise<T> {
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error('Inicia sesión de nuevo.');
  return usar(idToken);
}

const listarConSesion = () => conSesion((idToken) => listarUsuariosAdmin(idToken));
const cambiarConSesion = (uid: string, modalidad: Modalidad) =>
  conSesion((idToken) => cambiarModalidadUsuario(idToken, uid, modalidad));
const eliminarConSesion = (uid: string, confirmacion: string) =>
  conSesion((idToken) => eliminarUsuarioAdmin(idToken, uid, confirmacion));

/** El selector de modalidad de una fila. Mientras guarda queda deshabilitado. */
function SelectorModalidad({
  valor,
  guardando,
  onCambio,
}: {
  valor: Modalidad;
  guardando: boolean;
  onCambio: (modalidad: Modalidad) => void;
}) {
  return (
    <select
      value={valor}
      disabled={guardando}
      onChange={(e) => onCambio(e.target.value as Modalidad)}
      className="h-8 rounded-full border border-input bg-white px-2.5 text-xs font-semibold disabled:opacity-50"
      aria-label="Modalidad de acceso"
    >
      {MODALIDADES.map((m) => (
        <option key={m} value={m}>
          {NOMBRE_MODALIDAD[m]}
        </option>
      ))}
    </select>
  );
}

/** Las acciones se pueden reemplazar para ver el panel con datos de ejemplo. */
export function UsuariosAdminPanel({
  listar = listarConSesion,
  cambiar = cambiarConSesion,
  eliminar = eliminarConSesion,
}: {
  listar?: typeof listarConSesion;
  cambiar?: typeof cambiarConSesion;
  eliminar?: typeof eliminarConSesion;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [orden, setOrden] = useState<Orden>('registro');
  const [guardando, setGuardando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [porEliminar, setPorEliminar] = useState<UsuarioAdmin | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const [eliminando, setEliminando] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await listar();
      if (r.success) setUsuarios(r.data);
      else setError(r.error);
    })().catch((e) => setError(e instanceof Error ? e.message : 'No se pudo cargar la lista de usuarios.'));
  }, [listar]);

  const visibles = useMemo(() => {
    if (!usuarios) return [];
    const q = sinTildes(busqueda.trim());
    const filtrados = q
      ? usuarios.filter((u) => sinTildes(`${u.nombre ?? ''} ${u.email ?? ''}`).includes(q))
      : [...usuarios];
    const valor = (u: UsuarioAdmin) =>
      orden === 'uso' ? u.ultimoUso ?? '' : orden === 'consultas' ? String(u.consultas).padStart(6, '0') : u.registrado;
    return filtrados.sort((a, b) => valor(b).localeCompare(valor(a)));
  }, [usuarios, busqueda, orden]);

  const gratis = useMemo(() => (usuarios ?? []).filter((u) => u.modalidad === 'gratis_ilimitado').length, [usuarios]);

  async function cambiarModalidad(usuario: UsuarioAdmin, modalidad: Modalidad) {
    if (modalidad === usuario.modalidad) return;
    setAviso(null);
    setGuardando(usuario.uid);
    try {
      const r = await cambiar(usuario.uid, modalidad);
      if (r.success) {
        setUsuarios((previos) =>
          (previos ?? []).map((u) => (u.uid === usuario.uid ? { ...u, modalidad } : u))
        );
      } else {
        setAviso(r.error);
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo cambiar la modalidad.');
    } finally {
      setGuardando(null);
    }
  }

  function abrirEliminar(usuario: UsuarioAdmin) {
    setAviso(null);
    setConfirmacion('');
    setPorEliminar(usuario);
  }

  async function confirmarEliminar() {
    if (!porEliminar) return;
    setEliminando(true);
    try {
      const r = await eliminar(porEliminar.uid, confirmacion);
      if (r.success) {
        setUsuarios((previos) => (previos ?? []).filter((u) => u.uid !== porEliminar.uid));
        setPorEliminar(null);
        setConfirmacion('');
      } else {
        setAviso(r.error);
      }
    } catch (e) {
      setAviso(e instanceof Error ? e.message : 'No se pudo eliminar la cuenta.');
    } finally {
      setEliminando(false);
    }
  }

  if (error) return <MensajeError>{error}</MensajeError>;
  if (!usuarios) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const identificador = porEliminar?.email ?? porEliminar?.uid ?? '';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold">Usuarios</h2>
          <p className="text-sm text-muted-foreground">
            {numero(usuarios.length)} cuentas registradas, {numero(gratis)} gratis de por vida. Solo datos de la cuenta y de uso; el contenido de las consultas no se muestra.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o correo"
              className="h-10 rounded-full bg-white pl-9"
              aria-label="Buscar usuario"
            />
          </div>
          <select
            value={orden}
            onChange={(e) => setOrden(e.target.value as Orden)}
            className="h-10 rounded-full border border-input bg-white px-3 text-sm font-medium"
            aria-label="Ordenar"
          >
            {ORDENES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nombre}
              </option>
            ))}
          </select>
        </div>
      </div>

      {ACCESO_LIBRE && (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          El acceso libre sigue encendido: hoy entran todos sin pagar. La modalidad que marques aquí queda
          guardada y empieza a valer el día que se apague <code className="font-mono text-xs">ACCESO_LIBRE</code>.
        </p>
      )}

      {aviso && <MensajeError>{aviso}</MensajeError>}

      {/* Computador: tabla */}
      <Tarjeta className="hidden overflow-x-auto p-0 sm:p-0 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/70 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-3">Usuario</th>
              <th className="px-3 py-3">Registro</th>
              <th className="px-3 py-3">Último uso</th>
              <th className="px-3 py-3 text-right">Consultas</th>
              <th className="px-3 py-3 text-right">Familia</th>
              <th className="px-3 py-3">Acceso</th>
              <th className="px-3 py-3">Modalidad</th>
              <th className="px-5 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((u) => (
              <tr key={u.uid} className="border-b border-border/50 last:border-0">
                <td className="px-5 py-3">
                  <p className="font-semibold text-brand-900">{u.nombre || 'Sin nombre'}</p>
                  <p className="text-xs text-muted-foreground">{u.email ?? '—'}</p>
                </td>
                <td className="whitespace-nowrap px-3 py-3">{fecha(u.registrado)}</td>
                <td className="whitespace-nowrap px-3 py-3">{haceCuanto(u.ultimoUso)}</td>
                <td className="px-3 py-3 text-right">
                  <span className="font-semibold">{u.consultas}</span>
                  {u.ultimaConsulta && <span className="block text-xs text-muted-foreground">{haceCuanto(u.ultimaConsulta)}</span>}
                </td>
                <td className="px-3 py-3 text-right">{u.integrantes}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Etiqueta>{u.acceso || '—'}</Etiqueta>
                    {u.notificaciones && (
                      <span title="Notificaciones activadas" className="text-primary">
                        <Bell className="h-4 w-4" />
                      </span>
                    )}
                    {u.deshabilitado && <Etiqueta tono="malo">Deshabilitada</Etiqueta>}
                  </div>
                </td>
                <td className="px-3 py-3">
                  <SelectorModalidad
                    valor={u.modalidad}
                    guardando={guardando === u.uid}
                    onCambio={(modalidad) => cambiarModalidad(u, modalidad)}
                  />
                </td>
                <td className="px-5 py-3 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-700 hover:bg-red-50 hover:text-red-800"
                    onClick={() => abrirEliminar(u)}
                    aria-label={`Eliminar la cuenta de ${u.email ?? u.nombre ?? 'esta persona'}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!visibles.length && <p className="p-5 text-sm text-muted-foreground">Nadie coincide con la búsqueda.</p>}
      </Tarjeta>

      {/* Celular: tarjetas */}
      <ul className="space-y-2 md:hidden">
        {visibles.map((u) => (
          <li key={u.uid} className="rounded-2xl border border-border/70 bg-white p-4 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-900">{u.nombre || 'Sin nombre'}</p>
                <p className="truncate text-xs text-muted-foreground">{u.email ?? '—'}</p>
              </div>
              {u.notificaciones && <Bell className="h-4 w-4 shrink-0 text-primary" aria-label="Notificaciones activadas" />}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Registro</dt>
                <dd className="font-semibold">{fecha(u.registrado)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Último uso</dt>
                <dd className="font-semibold">{haceCuanto(u.ultimoUso)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Consultas</dt>
                <dd className="font-semibold">{u.consultas}</dd>
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between gap-2">
              <SelectorModalidad
                valor={u.modalidad}
                guardando={guardando === u.uid}
                onCambio={(modalidad) => cambiarModalidad(u, modalidad)}
              />
              <Button
                variant="ghost"
                size="sm"
                className="text-red-700 hover:bg-red-50 hover:text-red-800"
                onClick={() => abrirEliminar(u)}
                aria-label={`Eliminar la cuenta de ${u.email ?? u.nombre ?? 'esta persona'}`}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Eliminar
              </Button>
            </div>
          </li>
        ))}
        {!visibles.length && <p className="text-sm text-muted-foreground">Nadie coincide con la búsqueda.</p>}
      </ul>

      <AlertDialog open={!!porEliminar} onOpenChange={(abierto) => !abierto && setPorEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar la cuenta de {porEliminar?.nombre || identificador}</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra la cuenta y todo lo suyo: ficha, familia, conversaciones, informes y documentos. No hay
              forma de recuperarlo. Para confirmar, escribe <strong>{identificador}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder={identificador}
            aria-label="Confirmación"
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={eliminando || confirmacion.trim().toLowerCase() !== identificador.toLowerCase()}
              onClick={confirmarEliminar}
            >
              {eliminando ? 'Eliminando…' : 'Eliminar para siempre'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
