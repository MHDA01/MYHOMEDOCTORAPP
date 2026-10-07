'use client';

import { useEffect } from 'react';
import { registrarVisitaOrigen } from '@/app/actions/origen';
import { CLAVE_ORIGEN, CLAVE_VISITA, PARAMETROS_ORIGEN, diaBogota, fuenteDeParametros } from '@/lib/origen';

/**
 * Si la página se abrió desde el enlace de una red (?utm_source=tiktok), cuenta la
 * visita (una vez al día por red y navegador), recuerda la red para atribuirle el
 * registro y limpia la dirección para que, si alguien la comparte, no se cuente
 * otra vez como de esa red.
 */
export function OrigenVisita() {
  useEffect(() => {
    const url = new URL(window.location.href);
    const fuente = fuenteDeParametros(url.searchParams);
    if (!fuente) return;

    for (const p of PARAMETROS_ORIGEN) url.searchParams.delete(p);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);

    const ahora = Date.now();
    const marcaHoy = `${fuente}:${diaBogota(ahora)}`;
    let yaContada = false;
    try {
      localStorage.setItem(CLAVE_ORIGEN, JSON.stringify({ fuente, fecha: ahora }));
      yaContada = localStorage.getItem(CLAVE_VISITA) === marcaHoy;
      localStorage.setItem(CLAVE_VISITA, marcaHoy);
    } catch {
      // Navegación privada o almacenamiento bloqueado: se cuenta la visita igual.
    }
    if (!yaContada) registrarVisitaOrigen(fuente).catch(() => undefined);
  }, []);

  return null;
}
