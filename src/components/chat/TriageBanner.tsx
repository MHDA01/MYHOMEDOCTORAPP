// ============================================================
// components/chat/TriageBanner.tsx — Banner de advertencia de triage
// ============================================================
'use client';

export default function TriageBanner() {
  return (
    <div className="mx-4 mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 md:mx-6">
      <div className="text-[11px] leading-snug text-amber-900">
        Este servicio brinda orientación asistida por inteligencia artificial y no reemplaza una consulta médica formal. En una emergencia vital, acuda a urgencias o comuníquese con la línea 123.
      </div>
    </div>
  );
}
