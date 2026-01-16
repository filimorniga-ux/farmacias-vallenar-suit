/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // NUEVA PALETA: Azul Médico Clínico (Moderno y Elegante)
        'pharma-primary': {
          DEFAULT: '#0ea5e9', // Sky 500: Vibrante pero clínico
          hover: '#0284c7',   // Sky 600
          active: '#0369a1',  // Sky 700
          dark: '#0c4a6e',    // Sky 900
          light: '#e0f2fe',   // Sky 100
        },
        'pharma-secondary': {
          DEFAULT: '#14b8a6', // Teal 500: Acento quirúrgico/salud
          dark: '#0f766e',    // Teal 700
        },
        'pharma-surface': '#f8fafc', // Slate 50: Fondo clínico limpio
        'pharma-card': '#ffffff',
        'alert-error': '#ef4444',
      },
      // ANIMACIÓN DE FONDO SUTIL
      animation: {
        'gradient-slow': 'gradient 15s ease infinite',
      },
      keyframes: {
        'gradient': {
          '0%, 100%': { 'background-position': '0% 50%' },
          '50%': { 'background-position': '100% 50%' },
        }
      },
      boxShadow: {
        // Sombras más modernas y definidas para que las tarjetas "floten"
        'modern-sm': '0 1px 2px 0 rgb(0 0 0 / 0.05), 0 1px 3px 1px rgb(0 0 0 / 0.1)',
        'modern-md': '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        'modern-lg': '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      }
    },
  },
  plugins: [],
}