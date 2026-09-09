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
 * 2. La versión nueva se aplica sola, siempre y sin preguntar. HematoMed avisa
 *    y deja decidir, pero allá el público son estudiantes de medicina; aquí son
 *    pacientes, y la alternativa a la actualización automática es pedirles un
 *    hard reset en el celular. Se prefiere la recarga inesperada antes que esa
 *    barrera de acceso.
 */

import { useEffect } from 'react';

const CHECK_INTERVAL_MS = 20 * 60 * 1000; // 20 minutos

export function AppUpdateManager() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let enEspera: ServiceWorker | null = null;
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

      // Se aplica siempre y de inmediato, sin preguntar.
      //
      // HematoMed muestra un aviso y deja decidir al usuario, pero aquí el
      // público es distinto: son pacientes, no estudiantes de medicina, y la
      // alternativa a que la app se actualice sola es pedirles un hard reset en
      // el celular. Eso es una barrera de acceso mucho más cara que una recarga
      // inesperada, así que se prefiere la recarga.
      aplicarActualizacion();
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
          if (document.visibilityState === 'hidden') return;

          // Si quedó una versión lista mientras estaba fuera, se aplica al volver.
          if (enEspera) {
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
