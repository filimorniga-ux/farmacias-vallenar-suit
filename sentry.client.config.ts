import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://2fa7f3bacbbd3a389b2212a730debb9f@o4510737423269888.ingest.us.sentry.io/4510737442471936",

    // Configuración de Integraciones
    integrations: [
        Sentry.replayIntegration(),
        Sentry.browserTracingIntegration(),
    ],

    // Session Replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,

    // Debugging (Opcional, desactivar en producción si no es necesario)
    debug: false,
});
