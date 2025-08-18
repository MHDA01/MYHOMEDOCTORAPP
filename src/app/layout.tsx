
'use client';
import './globals.css';
import { Toaster } from "@/components/ui/toaster"
import { PT_Sans } from 'next/font/google';

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
});
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <title>MyHomeDoctorApp</title>
        <meta name="description" content="Tu asistente personal de gestión de salud." />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <link rel="canonical" href="https://www.myhomedoctorapp.com" />
        <link href="https://fonts.googleapis.com/css2?family=PT+Sans:wght@400;700&display=swap" rel="stylesheet" />
        <meta name="application-name" content="MyHomeDoctorApp" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="MyHomeDoctorApp" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#478CFF" />
        {/* --- Iconos para iOS --- */}
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        {/* --- Imágenes de Arranque (Splash Screens) para iOS --- */}
        {/* iPhone SE, 6, 7, 8 */}
        <link href="https://placehold.co/750x1334.png" media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)" rel="apple-touch-startup-image" />
        {/* iPhone 12, 13, 14, 15 Pro */}
        <link href="https://placehold.co/1170x2532.png" media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)" rel="apple-touch-startup-image" />
        {/* iPhone X, XS, 11 Pro, 12 mini, 13 mini */}
        <link href="https://placehold.co/1125x2436.png" media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3)" rel="apple-touch-startup-image" />
        {/* iPhone XR, 11 */}
        <link href="https://placehold.co/828x1792.png" media="(device-width: 414px) and (device-height: 896px) and (-webkit-device-pixel-ratio: 2)" rel="apple-touch-startup-image" />
        {/* iPhone 14 Pro Max */}
        <link href="https://placehold.co/1290x2796.png" media="(device-width: 430px) and (device-height: 932px) and (-webkit-device-pixel-ratio: 3)" rel="apple-touch-startup-image" />
        {/* iPad Pro 12.9" */}
        <link href="https://placehold.co/2048x2732.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)" rel="apple-touch-startup-image" />
        <link href="https://placehold.co/2732x2048.png" media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: landscape)" rel="apple-touch-startup-image" />
      </head>
      <body className={`${ptSans.variable} font-body antialiased`}>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
