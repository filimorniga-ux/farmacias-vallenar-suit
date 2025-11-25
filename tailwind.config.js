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
        // NUEVA PALETA AZUL PROFUNDA (Más contraste que el cyan anterior)
        'pharma-primary': {
            DEFAULT: colors.blue[600], // Azul vibrante para botones principales
            dark: colors.blue[800],    // Azul oscuro para textos sobre fondos claros
            light: colors.blue[100],   // Fondos muy suaves
        },
        'pharma-surface': colors.slate[50], // Fondo general claro
        'pharma-card': '#ffffff',           // Blanco puro para tarjetas
        'alert-heat': colors.red[600],
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