'use client';

import { TeleorientacionChatPage } from '@/components/dashboard/teleorientacion-chat';

// El consejo del día se movió al Inicio: encima del chat le quitaba a la
// conversación casi un tercio del alto de pantalla.
export default function TeleorientacionPage() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TeleorientacionChatPage />
    </div>
  );
}
