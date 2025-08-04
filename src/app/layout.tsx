'use client';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <title>MiDoctorDeCasaApp</title>
        <meta name="description" content="Tu asistente personal de gestión de salud." />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;700&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700&display=swap" rel="stylesheet" />
        <meta name="application-name" content="MiDoctorDeCasaApp" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MiDoctorDeCasaApp" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#35577C" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
      </head>
      <body className="font-body antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
