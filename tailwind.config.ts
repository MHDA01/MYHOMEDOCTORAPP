import type {Config} from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        headline: ['"Inter"', 'system-ui', 'sans-serif'],
        code: ['monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          light: 'hsl(160 60% 96%)',
          border: 'hsl(160 45% 85%)',
        },
        error: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          light: 'hsl(0 86% 97%)',
          border: 'hsl(0 80% 90%)',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: '#fef3c7',
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        brand: {
          50: 'hsl(var(--brand-50))',
          100: 'hsl(var(--brand-100))',
          200: 'hsl(var(--brand-200))',
          300: 'hsl(var(--brand-300))',
          400: 'hsl(var(--brand-400))',
          500: 'hsl(var(--brand-500))',
          600: 'hsl(var(--brand-600))',
          700: 'hsl(var(--brand-700))',
          800: 'hsl(var(--brand-800))',
          900: 'hsl(var(--brand-900))',
          950: 'hsl(var(--brand-950))',
        },
        teal: {
          50: 'hsl(var(--teal-50))',
          100: 'hsl(var(--teal-100))',
          200: 'hsl(var(--teal-200))',
          300: 'hsl(var(--teal-300))',
          400: 'hsl(var(--teal-400))',
          500: 'hsl(var(--teal-500))',
          600: 'hsl(var(--teal-600))',
          700: 'hsl(var(--teal-700))',
          800: 'hsl(var(--teal-800))',
          900: 'hsl(var(--teal-900))',
          950: 'hsl(var(--teal-950))',
        },
        sky: {
          50: 'hsl(var(--sky-50))',
          100: 'hsl(var(--sky-100))',
          200: 'hsl(var(--sky-200))',
          300: 'hsl(var(--sky-300))',
          400: 'hsl(var(--sky-400))',
          500: 'hsl(var(--sky-500))',
          600: 'hsl(var(--sky-600))',
          700: 'hsl(var(--sky-700))',
          800: 'hsl(var(--sky-800))',
          900: 'hsl(var(--sky-900))',
          950: 'hsl(var(--sky-950))',
        },
        surface: 'hsl(var(--secondary))',
        'surface-white': 'hsl(var(--background))',
        'border-neutral': 'hsl(var(--border))',
        'text-muted': 'hsl(var(--muted-foreground))',
        'text-body': 'hsl(var(--foreground))',
      },
      fontSize: {
        logo: ['13px', { lineHeight: '1.3' }],
        'nav-item': ['13px', { lineHeight: '1.3' }],
        'section-label': ['11px', { lineHeight: '1.3', letterSpacing: '0.03em' }],
        title: ['16px', { lineHeight: '1.3' }],
        subtitle: ['12px', { lineHeight: '1.4' }],
        body: ['14px', { lineHeight: '1.55' }],
        caption: ['11px', { lineHeight: '1.4' }],
        button: ['13px', { lineHeight: '1.3' }],
      },
      spacing: {
        // El resto de la escala (4/6/8/10/12/14/16/20px) ya existe por defecto en Tailwind
        '5.5': '22px',
      },
      boxShadow: {
        card: '0 2px 10px hsl(209 45% 17% / 0.05), 0 8px 24px hsl(209 45% 17% / 0.05)',
        'card-hover': '0 4px 14px hsl(209 45% 17% / 0.07), 0 12px 32px hsl(209 45% 17% / 0.08)',
        soft: '0 1px 3px hsl(209 45% 17% / 0.05)',
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
