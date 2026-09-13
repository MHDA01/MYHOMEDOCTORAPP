// ============================================================
// components/chat/TriageBanner.tsx — Banner de advertencia de triage
// ============================================================
'use client';

import { ShieldAlert } from 'lucide-react';

// Texto medicolegal: no cambiar la redacción sin revisión del médico responsable.
export default function TriageBanner() {
  return (
    <div className="mx-auto mb-4 flex max-w-xl items-start gap-2.5 rounded-2xl bg-warning/10 px-4 py-3">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
      <p className="text-xs leading-relaxed text-brand-900">
        Este servicio brinda orientación asistida por inteligencia artificial y no reemplaza una consulta médica formal. En una emergencia vital, acuda a urgencias o comuníquese con la línea 123.
      </p>
    </div>
  );
}
