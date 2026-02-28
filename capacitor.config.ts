import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmaciasvallenar.erp',
  appName: 'Farmacias Vallenar Suit',
  webDir: 'out',
  server: {
    url: 'https://www.farmaciasvallenarsuit.cl',
    cleartext: true,
    androidScheme: 'https',
    allowNavigation: ['www.farmaciasvallenarsuit.cl', 'farmaciasvallenarsuit.cl', '*.ondigitalocean.app']
  },
  plugins: {
    Keyboard: {
      resize: 'body',
      style: 'dark',
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffffff",
      showSpinner: false,
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "light",
      overlapsWebView: false,
      backgroundColor: "#ffffffff",
    },
  },
};

export default config;
