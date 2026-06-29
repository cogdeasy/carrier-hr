/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        collins: {
          50: '#eef3ff',
          100: '#d9e3ff',
          200: '#bccdff',
          300: '#8ea9ff',
          400: '#5a79ff',
          500: '#3450f5',
          600: '#1f33db',
          700: '#0033A0',
          800: '#062a86',
          900: '#0a2870',
          950: '#06163f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'ui-sans-serif', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.08)',
      },
    },
  },
  plugins: [],
};
