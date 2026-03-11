import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.farmaciasvallenar.erp',
  appName: 'Farmacias Vallenar Suit',
  webDir: 'out',
  ios: {
    // Fuerza safe-area insets en WebView para evitar solape con Dynamic Island / status bar
    contentInset: 'always',
  },
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
      style: "DARK",
      // Fullscreen: content extends behind the status bar (safe-areas handle overlap)
      overlapsWebView: true,
      backgroundColor: "#00000000",
    },
  },
};

export default config;
