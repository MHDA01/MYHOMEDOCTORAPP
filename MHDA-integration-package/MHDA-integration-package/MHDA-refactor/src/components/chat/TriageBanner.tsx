// ============================================================
// components/chat/TriageBanner.tsx — Banner de advertencia de triage
// ============================================================
'use client';

export default function TriageBanner() {
  return (
    <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-lg">⚠️</span>
        <div className="text-xs leading-relaxed text-amber-800">
          <strong>Atención:</strong> Este es un servicio de orientación asistido
          por Inteligencia Artificial.{' '}
          <strong>NO emite diagnósticos ni reemplaza una consulta médica formal.</strong>{' '}
          Si usted o su familiar presenta una emergencia vital (dolor en el pecho,
          dificultad para respirar, pérdida de conocimiento), diríjase
          inmediatamente a urgencias o comuníquese con la línea{' '}
          <strong className="text-red-600">123</strong>.
        </div>
      </div>
    </div>
  );
}
