import { Home, MessageCircleHeart, FileText, UserRound, ShieldCheck, type LucideIcon } from 'lucide-react';

/**
 * Destinos de navegación de la app. Es una sola lista para el menú lateral
 * (computador) y la barra inferior (celular), así los dos nunca se desfasan.
 *
 * Solo incluye lo que funciona hoy. Familia, Historial clínico, Medicamentos y
 * Educación aparecen en el mockup pero todavía no existen: se agregan aquí
 * cuando se implementen.
 */
export type NavItem = {
  href: string;
  label: string;
  /** Etiqueta corta para la barra inferior del celular. */
  shortLabel: string;
  icon: LucideIcon;
};

export const MAIN_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', shortLabel: 'Inicio', icon: Home },
  { href: '/dashboard/teleorientacion', label: 'Dra. Hilda', shortLabel: 'Dra. Hilda', icon: MessageCircleHeart },
  { href: '/dashboard/reportes', label: 'Mis informes', shortLabel: 'Informes', icon: FileText },
  { href: '/dashboard/cuenta', label: 'Mi cuenta', shortLabel: 'Cuenta', icon: UserRound },
];

/** Solo visible para administradores (ADMIN_EMAILS, verificado en el servidor con useEsAdmin). */
export const ADMIN_NAV_ITEM: NavItem = {
  href: '/dashboard/admin',
  label: 'Administración',
  shortLabel: 'Admin',
  icon: ShieldCheck,
};

export function isNavItemActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
