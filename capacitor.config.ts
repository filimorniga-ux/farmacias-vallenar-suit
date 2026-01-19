import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmaciasvallenar.erp',
  appName: 'Farmacias Vallenar Suit',
  webDir: 'out',
  server: {
    url: 'https://farmacias-vallenar-suit.vercel.app',
    cleartext: true,
    androidScheme: 'https',
    allowNavigation: ['farmacias-vallenar-suit.vercel.app', '*.vercel.app']
  }
};

export default config;
