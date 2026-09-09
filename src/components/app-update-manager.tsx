'use client';

/**
 * Gestión de actualizaciones de la app (PWA).
 *
 * Portado del mecanismo de HematoMed (src/lib/appUpdate.ts), adaptado al service
 * worker escrito a mano de este proyecto en vez de Workbox.
 *
 * Los dos problemas que resuelve, que el registro anterior no cubría:
 *
 * 1. Solo se comprobaba si había versión nueva UNA vez, al cargar la página. Una
 *    app instalada puede quedarse abierta días, así que nunca se enteraba de un
 *    despliegue. Ahora se revisa cada 20 minutos y cada vez que el usuario vuelve.
 *
 * 2. Al activarse el service worker nuevo se recargaba la página de inmediato.
 *    En una app de chat eso significa perder lo que el paciente estaba
 *    escribiendo. Ahora la versión nueva se aplica sola solo cuando la persona
 *    está fuera de la app, y si está usándola se le avisa para que decida.
 */

import { useEffect } from 'react';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';

const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutos
const BACKGROUND_GRACE_MS = 60 * 1000; // 60 segundos fuera de la app

export function AppUpdateManager() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let enEspera: ServiceWorker | null = null;
    let ocultoDesde: number | null = null;
    let yaAvisado = false;
    let aplicando = false;
    let limpiarSuscripciones: (() => void) | null = null;

    // Si no había controlador, es la primera instalación: activarla no debe
    // recargar nada porque el usuario ya está viendo la versión más reciente.
    const teniaControlador = Boolean(navigator.serviceWorker.controller);

    const aplicarActualizacion = () => {
      if (!enEspera || aplicando) return;
      aplicando = true;
      enEspera.postMessage({ type: 'SKIP_WAITING' });
    };

    const alCambiarControlador = () => {
      if (!teniaControlador) return;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', alCambiarControlador);

    const anunciarVersionNueva = (worker: ServiceWorker) => {
      enEspera = worker;

      // Si no está mirando, se actualiza sola: al volver ya está al día.
      if (document.visibilityState === 'hidden') {
        aplicarActualizacion();
        return;
      }

      if (yaAvisado) return;
      yaAvisado = true;

      toast({
        title: 'Hay una versión nueva',
        description: 'Puedes actualizar cuando termines lo que estás haciendo.',
        action: (
          <ToastAction altText="Actualizar ahora" onClick={aplicarActualizacion}>
            Actualizar
          </ToastAction>
        ),
      });
    };

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (registration.waiting) {
          anunciarVersionNueva(registration.waiting);
        }

        registration.addEventListener('updatefound', () => {
          const instalando = registration.installing;
          if (!instalando) return;

          instalando.addEventListener('statechange', () => {
            if (instalando.state === 'installed' && navigator.serviceWorker.controller) {
              anunciarVersionNueva(instalando);
            }
          });
        });

        const revisar = () => {
          void registration.update().catch(() => undefined);
        };

        const intervalo = window.setInterval(() => {
          if (document.visibilityState === 'visible') revisar();
        }, CHECK_INTERVAL_MS);

        const alCambiarVisibilidad = () => {
          if (document.visibilityState === 'hidden') {
            ocultoDesde = Date.now();
            return;
          }

          const tiempoFuera = ocultoDesde ? Date.now() - ocultoDesde : 0;
          ocultoDesde = null;

          // Estuvo fuera un buen rato y ya había versión lista: se aplica ahora,
          // cuando con seguridad no hay nada a medias.
          if (enEspera && tiempoFuera >= BACKGROUND_GRACE_MS) {
            aplicarActualizacion();
            return;
          }

          revisar();
        };

        document.addEventListener('visibilitychange', alCambiarVisibilidad);

        limpiarSuscripciones = () => {
          window.clearInterval(intervalo);
          document.removeEventListener('visibilitychange', alCambiarVisibilidad);
        };

        revisar();
      })
      .catch(() => undefined);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiarControlador);
      limpiarSuscripciones?.();
    };
  }, []);

  return null;
}
