import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmaciasvallenar.erp',
  appName: 'Farmacias Vallenar Suit',
  webDir: 'out',
  server: {
    url: 'https://farmaciasvallenar.vercel.app',
    cleartext: true,
    androidScheme: 'https',
    allowNavigation: ['farmaciasvallenar.vercel.app', '*.vercel.app']
  }
};

export default config;
