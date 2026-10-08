/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./frontend/index.html",
    "./frontend/src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        rust: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#e05338', // Authentic Rust Ember
          600: '#ce422b', // Rust Official Red-Orange
          700: '#b03420',
          800: '#8c2818',
          900: '#6b1e12',
          950: '#3d0e08',
        },
        orange: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#ea5a36', // Authentic Rust Ember
          500: '#e05338', // Facepunch Rust Orange
          600: '#ce422b', // Deep Rust Red-Orange
          700: '#b03420',
          800: '#8c2818',
          900: '#6b1e12',
        },
        emerald: {
          50: '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399', // Refined mint emerald
          500: '#10b981', // Crisp gaming emerald
          600: '#059669',
          700: '#047857',
        },
        green: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#38d39f', // Calibrated app green
          500: '#23a55a', // Discord / modern app green
          600: '#16a34a',
          700: '#15803d',
        },
        dark: {
          canvas: '#090a0e',
          bg: '#0e1015',
          card: '#13161c',
          elevated: '#181c24',
          border: 'rgba(255, 255, 255, 0.07)',
          borderHover: 'rgba(224, 83, 56, 0.4)',
          muted: '#8b949e',
        },
        gaming: {
          bg: '#0e1015',
          surface: '#12141a',
          card: '#151820',
          elevated: '#1a1e28',
          border: 'rgba(255, 255, 255, 0.07)',
          borderHover: 'rgba(224, 83, 56, 0.35)',
          purple: '#ce422b',
          violet: '#e05338',
          glow: '#e05338',
          ember: '#ce422b',
        }
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.125rem',
        '4xl': '1.25rem',
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
