// ============================================================
// tailwind.config.ts — Configuración con colores de marca MyHomeDoctorApp
// INSTRUCCIONES: Fusiona estos colores con tu tailwind.config existente
// ============================================================
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Paleta de marca — basada en los azules del logo MyHomeDoctorApp
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#1E5F8B', // Azul principal del logo
          700: '#1A4F75',
          800: '#153D5E',
          900: '#0F2B47',
          950: '#091A2E',
        },
        // Acentos médicos
        medical: {
          green: '#2BAD8E',  // Verde del ícono médico del logo
          red: '#DC2626',    // Urgencias
          amber: '#F59E0B',  // Advertencias
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'bounce': 'bounce 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
