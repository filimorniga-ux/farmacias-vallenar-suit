/** @type {import('next').NextConfig} */
const nextConfig = {
    // Optimización para producción
    reactStrictMode: true,

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

export default nextConfig;
