'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  HeartPulse,
  Video,
  Siren,
  FileText,
  User,
  ShieldAlert,
} from 'lucide-react'
import { Logo } from '@/components/logo'

export function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <Logo className="h-10 w-auto" />
          </Link>
          <nav className="flex items-center gap-4">
            <Button variant="ghost" asChild>
              <Link href="/login">Iniciar Sesión</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Registrarse</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="w-full py-12 md:py-24 lg:py-32 xl:py-48 bg-secondary/50">
          <div className="container px-4 md:px-6">
            <div className="grid gap-6 lg:grid-cols-[1fr_500px] lg:gap-12 xl:grid-cols-[1fr_600px]">
              <div className="flex flex-col justify-center space-y-4">
                <div className="space-y-2">
                  <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl xl:text-6xl/none font-headline">
                    Tu Salud, Gestionada Inteligentemente
                  </h1>
                  <p className="max-w-[600px] text-muted-foreground md:text-xl">
                    MiDoctorDeCasaApp es tu asistente personal de salud.
                    Centraliza tu historial médico, gestiona citas, recibe
                    recordatorios y accede a teleconsultas, todo en un solo
                    lugar seguro.
                  </p>
                </div>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <Button size="lg" asChild>
                    <Link href="/register">Comienza Ahora</Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild>
                    <Link href="#features">Conoce Más</Link>
                  </Button>
                </div>
              </div>
              <Image
                src="https://placehold.co/600x600.png"
                width="600"
                height="600"
                alt="Hero"
                data-ai-hint="doctor patient illustration"
                className="mx-auto aspect-square overflow-hidden rounded-xl object-cover sm:w-full lg:order-last"
              />
            </div>
          </div>
        </section>

        <section id="features" className="w-full py-12 md:py-24 lg:py-32">
          <div className="container space-y-12 px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-muted px-3 py-1 text-sm">
                  Características Clave
                </div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl font-headline">
                  Todo lo que necesitas para cuidar tu salud
                </h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Desde un historial médico unificado hasta teleconsultas y
                  atención de urgencia, tenemos todo cubierto.
                </p>
              </div>
            </div>
            <div className="mx-auto grid items-start gap-8 sm:max-w-4xl sm:grid-cols-2 md:gap-12 lg:max-w-5xl lg:grid-cols-3">
              <FeatureCard
                icon={<HeartPulse className="h-8 w-8" />}
                title="Historial Médico Unificado"
                description="Toda tu información de salud, antecedentes, alergias, medicamentos y documentos en un solo lugar accesible."
              />
              <FeatureCard
                icon={<Video className="h-8 w-8" />}
                title="Teleconsulta"
                description="Conéctate con médicos especialistas a través de videollamadas seguras sin salir de casa."
              />
              <FeatureCard
                icon={<Siren className="h-8 w-8" />}
                title="Urgencias y Domicilio"
                description="Accede rápidamente a números de emergencia y contacta a proveedores de atención domiciliaria."
              />
              <FeatureCard
                icon={<FileText className="h-8 w-8" />}
                title="Gestión de Documentos"
                description="Sube y organiza tus resultados de laboratorio, recetas e informes médicos de forma segura."
              />
              <FeatureCard
                icon={<User className="h-8 w-8" />}
                title="Información Personal"
                description="Mantén tus datos personales y de previsión siempre actualizados para una atención más eficiente."
              />
              <FeatureCard
                icon={<ShieldAlert className="h-8 w-8" />}
                title="Contactos de Emergencia"
                description="Define tus contactos de emergencia para que estén disponibles en caso de cualquier eventualidad."
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} MiDoctorDeCasaApp. Todos los
          derechos reservados.
        </p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <Link
            href="#"
            className="text-xs hover:underline underline-offset-4"
          >
            Términos de Servicio
          </Link>
          <Link
            href="#"
            className="text-xs hover:underline underline-offset-4"
          >
            Política de Privacidad
          </Link>
        </nav>
      </footer>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground">
          {icon}
        </div>
        <h3 className="text-lg font-bold font-headline">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
