import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1rem', md: '1.5rem', lg: '2rem' },
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
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
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        charcoal: {
          DEFAULT: 'hsl(var(--charcoal))',
          foreground: 'hsl(var(--charcoal-foreground))',
        },
        steel: {
          50: '#f6f7f8',
          100: '#eceef0',
          200: '#d4d8dd',
          300: '#aeb6bf',
          400: '#818d9b',
          500: '#637180',
          600: '#4e5a68',
          700: '#414a55',
          800: '#393f48',
          900: '#33373e',
          950: '#1f2227',
        },
        ember: {
          50: '#fff4ed',
          100: '#ffe6d4',
          200: '#ffc8a8',
          300: '#ffa270',
          400: '#fe7037',
          500: '#e1632a',
          600: '#d44708',
          700: '#af3409',
          800: '#8b2c0f',
          900: '#70270f',
          950: '#3c1105',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        heading: ['Montserrat', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['Open Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      letterSpacing: {
        brand: '0.18em',
      },
      boxShadow: {
        glow: '0 0 0 1px hsl(var(--primary) / 0.35), 0 18px 60px -18px hsl(var(--primary) / 0.55)',
        lift: '0 24px 60px -24px rgb(0 0 0 / 0.45)',
        inset: 'inset 0 1px 0 0 rgb(255 255 255 / 0.08)',
      },
      backgroundImage: {
        'grid-fade':
          'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        'tread-scroll': {
          from: { backgroundPosition: '0 0' },
          to: { backgroundPosition: '0 -96px' },
        },
      },
      animation: {
        marquee: 'marquee 38s linear infinite',
        'marquee-slow': 'marquee 64s linear infinite',
        shimmer: 'shimmer 2.2s infinite',
        'spin-slow': 'spin-slow 14s linear infinite',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.24, 0, 0.38, 1) infinite',
        'tread-scroll': 'tread-scroll 1.6s linear infinite',
      },
      transitionTimingFunction: {
        brand: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}

export default config
