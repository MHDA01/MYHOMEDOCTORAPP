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
          DEFAULT: '#1a365d',
          foreground: '#ffffff',
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
          DEFAULT: '#10b981',
          light: '#f0fdf4',
          border: '#bbf7d0',
        },
        error: {
          DEFAULT: '#ef4444',
          light: '#fee2e2',
          border: '#fecaca',
        },
        warning: {
          DEFAULT: '#f59e0b',
          light: '#fef3c7',
        },
        sidebar: {
          DEFAULT: '#1a365d',
          foreground: '#ffffff',
          primary: '#10b981',
          'primary-foreground': '#ffffff',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))',
        },
        brand: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#1E5F8B',
          700: '#1A4F75',
          800: '#153D5E',
          900: '#0F2B47',
          950: '#091A2E',
        },
        surface: '#f7fafc',
        'surface-white': '#ffffff',
        'border-neutral': '#e2e8f0',
        'text-muted': '#64748b',
        'text-body': '#1e293b',
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
        card: '0 4px 16px rgba(26,54,93,0.08)',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
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
