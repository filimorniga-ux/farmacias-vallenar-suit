/** @type {import('next').NextConfig} */
const nextConfig = {
    // Optimización para producción
    reactStrictMode: true,
    output: 'standalone',

    // Variables de entorno expuestas al cliente
    env: {
        NEXT_PUBLIC_APP_NAME: 'Farmacias Vallenar Suit',
    },

    // Optimizaciones de build
    compiler: {
        removeConsole: process.env.NODE_ENV === 'production' ? {
            exclude: ['error', 'warn'],
        } : false,
    },

    // Server Actions Configuration
    experimental: {
        serverActions: {
            bodySizeLimit: '5mb', // Increase limit for WYSIWYG content (Base64 images)
        },
    },

    // Fix for Pino/ThreadStream bundling issues in Turbopack
    serverExternalPackages: ['pino', 'thread-stream', 'pino-pretty'],

    // Fuera de Vercel conviene poder desactivar optimización de imágenes
    // para bajar consumo de CPU/RAM en contenedor.
    images: {
        unoptimized: process.env.NEXT_IMAGE_UNOPTIMIZED === 'true',
    },

    // Headers de seguridad
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: [
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff',
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY',
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block',
                    },
                ],
            },
        ];
    },
};

import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
    dest: 'public',
    disable: process.env.NODE_ENV === 'development', // Deshabilitar en dev para evitar recargas constantes y uso de memoria
    register: true,
    skipWaiting: true,
    buildExcludes: [/middleware-manifest\.json$/], // Avoids common App Router/PWA issues
    runtimeCaching: [
        // 1. Auth & Critical: NetworkOnly (Security & Logic)
        {
            urlPattern: /^\/(login|auth|api\/auth).*/i,
            handler: 'NetworkOnly',
        },
        // 2. Assets: CacheFirst (Strict)
        {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
                cacheName: 'google-fonts-webfonts',
                expiration: {
                    maxEntries: 4,
                    maxAgeSeconds: 365 * 24 * 60 * 60, // 365 days
                },
            },
        },
        {
            urlPattern: /\.(?:eot|otf|ttc|ttf|woff|woff2|font.css)$/i,
            handler: 'CacheFirst', // Changed from StaleWhileRevalidate
            options: {
                cacheName: 'static-font-assets',
                expiration: {
                    maxEntries: 4,
                    maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
                },
            },
        },
        {
            urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp)$/i,
            handler: 'CacheFirst', // Changed from StaleWhileRevalidate
            options: {
                cacheName: 'static-image-assets',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60, // 24 hours
                },
            },
        },
        {
            urlPattern: /\/_next\/image\?url=.+$/i,
            handler: 'CacheFirst', // Changed from StaleWhileRevalidate
            options: {
                cacheName: 'next-image',
                expiration: {
                    maxEntries: 64,
                    maxAgeSeconds: 24 * 60 * 60, // 24 hours
                },
            },
        },
        // 3. API & Data: NetworkFirst (Freshness with fallback)
        {
            urlPattern: /^\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
                cacheName: 'apis',
                expiration: {
                    maxEntries: 16,
                    maxAgeSeconds: 24 * 60 * 60, // 24 hours
                },
                networkTimeoutSeconds: 10, // Fallback to cache if network slow
            },
        },
    ],
});

import { withSentryConfig } from "@sentry/nextjs";

export default withSentryConfig(withPWA(nextConfig), {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    org: "farmacias-vallenar-suit",
    project: "javascript-nextjs",

    // Only print logs for uploading source maps in CI
    silent: true,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
        enabled: true,
    },

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Updated Sentry optimization configuration (replaces deprecated keys)
    webpack: {
        reactComponentAnnotation: { enabled: true },
        treeshake: { removeDebugLogging: true },
        automaticVercelMonitors: true,
    }
});
