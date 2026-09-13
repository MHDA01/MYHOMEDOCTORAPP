'use client';

import { useContext, useEffect, useState } from 'react';
import { UserContext } from '@/context/user-context';
import { auth } from '@/lib/firebase';
import { consultarAccesoAdmin } from '@/app/actions/admin';

// Una sola consulta por sesión aunque el menú lateral, la barra inferior y el
// chat pregunten a la vez.
const consultas = new Map<string, Promise<boolean>>();

/**
 * `null` mientras se consulta. El servidor decide (ADMIN_EMAILS); esto solo sirve
 * para mostrar u ocultar el menú: cada acción de administración se vuelve a
 * verificar en el servidor.
 */
export function useEsAdmin(): boolean | null {
  const uid = useContext(UserContext)?.user?.uid;
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!uid) {
      setEsAdmin(false);
      return;
    }
    let vigente = true;
    if (!consultas.has(uid)) {
      consultas.set(
        uid,
        (async () => {
          const idToken = await auth.currentUser?.getIdToken();
          return idToken ? consultarAccesoAdmin(idToken) : false;
        })().catch(() => {
          consultas.delete(uid);
          return false;
        })
      );
    }
    consultas.get(uid)!.then((valor) => {
      if (vigente) setEsAdmin(valor);
    });
    return () => {
      vigente = false;
    };
  }, [uid]);

  return esAdmin;
}
