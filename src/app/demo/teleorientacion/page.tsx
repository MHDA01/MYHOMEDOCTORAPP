import Link from 'next/link';

export default function DemoTeleorientacionPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900">
      <div className="mx-auto flex max-w-6xl flex-col gap-8">
        <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-indigo-600">
            Vista de demostración
          </p>
          <h1 className="text-3xl font-bold sm:text-4xl">
            Teleorientación · tokens y pasarela Wompy
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Esta vista simula cómo se vería la experiencia para el usuario sin depender de credenciales ni de base de datos.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500">Estado de consultas</p>
                <h2 className="text-xl font-bold">Contador de tokens</h2>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-700">
                Activo
              </span>
            </div>

            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-600 p-2 text-white">⚡</div>
                <div>
                  <p className="text-sm font-semibold text-emerald-900">Consultas disponibles</p>
                  <p className="text-sm text-emerald-700">🎁 3 gratis · ⭐ 1 premium</p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-800">Valor actual</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">4 tokens</p>
              <p className="mt-2 text-sm text-slate-600">
                El contador se actualiza automáticamente cuando el usuario compra o consume una consulta.
              </p>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4">
              <p className="text-sm font-semibold text-slate-500">Pago seguro</p>
              <h2 className="text-xl font-bold">Pasarela Wompy</h2>
            </div>

            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
              <p className="text-sm font-semibold text-indigo-900">Plan mensual</p>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <p className="text-3xl font-bold text-indigo-700">$19.900</p>
                  <p className="text-sm text-indigo-700">COP por 30 días</p>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-indigo-700">
                  24/7
                </span>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <ul className="space-y-2 text-sm text-slate-700">
                <li>✓ Acceso a especialistas médicos</li>
                <li>✓ Respuestas en tiempo real</li>
                <li>✓ Historial de consultas guardado</li>
              </ul>
            </div>

            <button className="mt-5 w-full rounded-2xl bg-indigo-600 px-4 py-3 text-center font-semibold text-white shadow-sm transition hover:bg-indigo-700">
              Ir a Wompy
            </button>
          </div>
        </section>

        <div className="flex gap-3">
          <Link href="/landing" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Volver a la landing
          </Link>
          <Link href="/register" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Ir a registro
          </Link>
        </div>
      </div>
    </main>
  );
}
