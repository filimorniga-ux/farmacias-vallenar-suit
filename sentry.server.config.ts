import * as Sentry from "@sentry/nextjs";

Sentry.init({
    dsn: process.env.SENTRY_DSN || "https://2fa7f3bacbbd3a389b2212a730debb9f@o4510737423269888.ingest.us.sentry.io/4510737442471936",
    tracesSampleRate: 1.0,
});
