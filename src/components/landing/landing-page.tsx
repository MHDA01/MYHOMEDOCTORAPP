
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Lock, ShieldCheck, Users } from 'lucide-react';
import { BrandLockup } from '@/components/brand-lockup';

// Página de entrada. Sigue la dirección de arte del mockup (azul profundo,
// turquesa, superficies claras, tarjetas con íconos en círculo) sin copiar sus
// fotos: se usan el logo y el avatar de la Dra. Hilda que ya tiene la app.
// Los textos son los que ya existían.

const FEATURES = [
  {
    icon: ShieldCheck,
    title: 'Confianza Médica',
    text: 'Orientación basada en ciencia y protocolos de nivel 1A.',
  },
  {
    icon: Lock,
    title: 'Privacidad Total',
    text: 'Tus datos de salud están protegidos y son confidenciales.',
  },
  {
    icon: Users,
    title: 'Atención Familiar',
    text: 'Registra a tus hijos y adultos mayores en una sola cuenta.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-foreground">
      <header className="absolute inset-x-0 top-0 z-20 px-5 py-4 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between">
          <BrandLockup />
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold text-brand-900 transition-colors hover:bg-white/70"
            >
              Iniciar sesión
            </Link>
            <Link
              href="/register"
              className="hidden h-10 items-center rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition-colors hover:bg-teal-600 sm:inline-flex"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-sky-100 via-sky-50 to-white px-5 pb-16 pt-28 sm:px-10 lg:px-16 lg:pb-24 lg:pt-32">
          <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-brand-700/5 blur-3xl" />

          <div className="relative mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-teal-700 shadow-soft">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
                IA médica asistida por profesionales
              </div>
              <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-tight text-brand-900 sm:text-5xl lg:text-[56px]">
                Tu médico de familia digital, disponible 24/7
              </h1>
              <p className="max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
                Dra. Hilda es tu asistente de orientación en salud, creada por médicos para cuidar de ti y tu familia de forma humana y segura.
              </p>
              <Link
                href="/register"
                className="group inline-flex h-14 items-center justify-center gap-3 rounded-full bg-primary px-8 text-base font-bold text-primary-foreground shadow-card transition-all hover:bg-teal-600 hover:shadow-card-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                Comenzar orientación ahora
              </Link>
            </div>

            {/* Teléfono con la conversación, como las pantallas del mockup */}
            <div className="relative mx-auto w-full max-w-[340px]">
              <div className="rounded-[2.75rem] border-[10px] border-brand-900 bg-white shadow-card-hover">
                <div className="flex items-center gap-3 border-b border-border/70 px-5 pb-4 pt-6">
                  <Image
                    src="/images/dra-hilda-avatar.png"
                    alt="Dra. Hilda"
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover shadow-soft ring-2 ring-white"
                    priority
                  />
                  <div className="leading-tight">
                    <p className="flex items-center gap-1.5 text-[15px] font-bold text-brand-900">
                      Dra. Hilda
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-teal-700">IA</span>
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
                      En línea
                    </p>
                  </div>
                </div>
                <div className="space-y-3 px-4 py-5">
                  <div className="ml-auto max-w-[85%] rounded-3xl rounded-br-lg bg-brand-900 px-4 py-2.5 text-sm leading-relaxed text-white">
                    Hola Dra. Hilda, mi hijo tiene fiebre desde anoche.
                  </div>
                  <div className="max-w-[88%] rounded-3xl rounded-tl-lg bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
                    Te ayudo ahora mismo. Empecemos con temperatura, hidratación y señales de alarma para orientarte con seguridad.
                  </div>
                </div>
                <div className="px-4 pb-6">
                  <div className="flex h-11 items-center justify-between rounded-full border border-border pl-4 pr-1">
                    <span className="text-xs text-muted-foreground">Escribe tu mensaje...</span>
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white" aria-hidden>
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 py-14 sm:px-10 lg:px-16 lg:py-20">
          <div className="mx-auto grid w-full max-w-6xl gap-5 md:grid-cols-3 md:gap-6">
            {FEATURES.map((f) => (
              <article
                key={f.title}
                className="flex items-start gap-4 rounded-2xl border border-border/70 bg-white p-6 shadow-soft transition-shadow hover:shadow-card"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-white">
                  <f.icon className="h-6 w-6" strokeWidth={1.8} />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-brand-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-brand-900 px-5 py-7 sm:px-10 lg:px-16">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-sm text-white/75 sm:flex-row sm:items-center sm:justify-between">
          <p>Un producto de MyHomeDoctorApp • IA médica asistida</p>
          <div className="flex items-center gap-5">
            <Link href="#" className="transition hover:text-white">TyC</Link>
            <Link href="#" className="transition hover:text-white">Privacidad</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
