/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Design tokens are driven by CSS variables so the accent colour and
        // light/dark surfaces can change at runtime without a rebuild.
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--c-surface-2) / <alpha-value>)',
        border: 'rgb(var(--c-border) / <alpha-value>)',
        text: 'rgb(var(--c-text) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        'accent-soft': 'rgb(var(--c-accent) / 0.12)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        danger: 'rgb(var(--c-danger) / <alpha-value>)',
        protein: 'rgb(var(--c-protein) / <alpha-value>)',
        carbs: 'rgb(var(--c-carbs) / <alpha-value>)',
        fat: 'rgb(var(--c-fat) / <alpha-value>)',
      },
      fontFamily: {
        // Apple devices get SF (native feel); everything else the bundled Inter.
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Inter Variable"',
          'system-ui',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        // Editorial serif for page titles and hero numbers only.
        serif: ['"Newsreader Variable"', 'Georgia', 'serif'],
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        sheet: '0 -12px 48px -16px rgb(0 0 0 / 0.28)',
        // Barely-there lift; cards are separated by the paper ground.
        card: '0 1px 2px rgb(40 32 16 / 0.05)',
        pop: '0 1px 2px rgb(0 0 0 / 0.06), 0 2px 6px rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
};
