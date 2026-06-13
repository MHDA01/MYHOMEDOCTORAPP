
import Image from 'next/image';
import Link from 'next/link';

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <main>
        <section className="px-6 pt-16 pb-14 sm:px-10 lg:px-16">
          <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-2">
            <div className="space-y-7">
              <div className="inline-flex items-center rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
                IA médica asistida por profesionales
              </div>
              <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
                Tu médico de familia digital, disponible 24/7
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-slate-600 sm:text-xl">
                Dra. Hilda es tu asistente de orientación en salud, creada por médicos para cuidar de ti y tu familia de forma humana y segura.
              </p>
              <Link
                href="/register"
                className="inline-flex min-h-14 items-center justify-center rounded-full bg-slate-900 px-10 text-base font-semibold text-white shadow-lg shadow-slate-300/80 transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                Comenzar orientación ahora
              </Link>
            </div>

            <div className="relative">
              <div className="mx-auto w-full max-w-md rounded-3xl border border-white/40 bg-white/70 p-6 shadow-2xl shadow-slate-200/70 backdrop-blur-xl">
                <div className="flex items-center gap-4 pb-5">
                  <div className="rounded-full bg-gradient-to-b from-slate-200 to-slate-100 p-1.5">
                    <Image
                      src="/images/dra-hilda-avatar.png"
                      alt="Dra. Hilda"
                      width={84}
                      height={84}
                      className="h-20 w-20 rounded-full border border-white object-cover"
                      priority
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-500">Asistente de Salud</p>
                    <p className="text-xl font-semibold text-slate-900">Dra. Hilda</p>
                  </div>
                </div>
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2 text-sm text-white">
                    Hola Dra. Hilda, mi hijo tiene fiebre desde anoche.
                  </div>
                  <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-slate-100 px-4 py-2 text-sm text-slate-700">
                    Te ayudo ahora mismo. Empecemos con temperatura, hidratación y señales de alarma para orientarte con seguridad.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-100 bg-white px-6 py-14 sm:px-10 lg:px-16">
          <div className="mx-auto grid w-full max-w-6xl gap-6 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900/5 text-slate-800">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
                  <path d="M9.5 12.5l1.8 1.8 3.8-4" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Confianza Médica</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Orientación basada en ciencia y protocolos de nivel 1A.</p>
            </article>

            <article className="rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900/5 text-slate-800">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <rect x="5" y="10" width="14" height="10" rx="2" />
                  <path d="M8 10V7a4 4 0 018 0v3" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Privacidad Total</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Tus datos de salud están protegidos y son confidenciales.</p>
            </article>

            <article className="rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-100">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900/5 text-slate-800">
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M16 19a4 4 0 00-8 0" />
                  <circle cx="12" cy="11" r="3" />
                  <path d="M6.8 19a3.3 3.3 0 00-6.6 0" transform="translate(4 0)" />
                  <circle cx="6" cy="11" r="2" transform="translate(4 0)" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Atención Familiar</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">Registra a tus hijos y adultos mayores en una sola cuenta.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-100 px-6 py-6 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>Un producto de MyHomeDoctorApp • IA médica asistida</p>
          <div className="flex items-center gap-5">
            <Link href="#" className="transition hover:text-slate-700">TyC</Link>
            <Link href="#" className="transition hover:text-slate-700">Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
