import { BaseDeReglasAdminPanel } from '@/components/admin/base-de-reglas-admin';

/**
 * Cuelga de Protocolos y no de una sección nueva del menú a propósito: la
 * fábrica de `protocolos/` es de donde salen las reglas, y la pestaña Protocolos
 * se queda marcada mientras se está aquí (`activa()` en `admin-shell.tsx` mira
 * el prefijo de la ruta).
 *
 * El segmento fijo `base-de-reglas` gana sobre el dinámico `[borradorId]`, que
 * es hermano suyo.
 */
export default function AdminBaseDeReglasPage() {
  return <BaseDeReglasAdminPanel />;
}
