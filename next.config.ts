import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  // El badge de dev tools (solo visible en desarrollo) por defecto queda abajo a la
  // izquierda, tapando la tarjeta de usuario del sidebar de teleorientación.
  devIndicators: {
    position: 'bottom-right',
  },
  typescript: {
    ignoreBuildErrors: false, // ✅ Habilitado - Detectar errores de tipo en build
    tsconfigPath: './tsconfig.json',
  },
  eslint: {
    ignoreDuringBuilds: false, // ✅ Habilitado - Ejecutar ESLint en build
    dirs: ['src', 'functions', 'pages', 'app'],
  },
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'placehold.co',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'www.familymed.cl',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.postimg.cc',
        port: '',
        pathname: '/**',
      }
    ],
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production';

    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(self), camera=(), payment=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // 'unsafe-eval' es requerido solo en desarrollo: los bundles de dev de Next.js (webpack y Turbopack)
              // usan eval() para envolver módulos; sin esto el CSP bloquea todo el JS del cliente y la app no hidrata.
              `script-src 'self' 'unsafe-inline' ${isDev ? "'unsafe-eval' " : ''}https://*.firebaseapp.com https://*.googleapis.com https://*.abacus.ai`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
              "img-src 'self' data: https:",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.abacus.ai https://routellm.abacus.ai https://us-central1-myhomedoctorapp.cloudfunctions.net https://firestore.googleapis.com https://*.cloudfunctions.net https://production.wompi.co",
              "frame-src 'self' https://*.firebaseapp.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
      // El service worker y el manifest deben revalidarse SIEMPRE: si el navegador
      // sirve una copia cacheada de sw.js, nunca detecta que hay una versión nueva
      // de la app y el usuario se queda atascado en el build viejo hasta que haga
      // un hard-reset manual. Los archivos con hash (JS/CSS de _next/static) no
      // necesitan esto: su nombre cambia solo cuando cambia el contenido.
      ...['/sw.js', '/firebase-messaging-sw.js', '/manifest.webmanifest'].map((source) => ({
        source,
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      })),
    ];
  },
};

export default nextConfig;
