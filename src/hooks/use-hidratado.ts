'use client';

import { useEffect, useState } from 'react';

/**
 * Verdadero cuando el componente ya montó en el navegador.
 *
 * Lo usan los formularios que llevan contraseña. Antes de que React hidrate, el
 * `onSubmit` todavía no está puesto: si alguien alcanza a enviar el formulario
 * —conexión lenta, celular viejo, un toque impaciente—, el navegador lo manda de
 * forma nativa y la contraseña termina en la barra de direcciones, y de ahí en
 * los registros del servidor y en el historial.
 *
 * Con esto el botón de enviar nace deshabilitado, así que no hay envío nativo
 * que valga: ni por clic, ni con Enter (el navegador no hace envío implícito
 * cuando el botón de enviar está deshabilitado).
 */
export function useHidratado(): boolean {
  const [hidratado, setHidratado] = useState(false);
  useEffect(() => setHidratado(true), []);
  return hidratado;
}
