import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';


const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Farmacias Vallenar Suit',
    description: 'Sistema integral de gestión farmacéutica para Farmacias Vallenar',
    manifest: '/manifest.json',
};

export const viewport: Viewport = {
    themeColor: '#0e7490',
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
    interactiveWidget: 'resizes-content',
};

import Providers from './providers';

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className={`${inter.className} min-h-dvh pt-safe pb-safe`} suppressHydrationWarning={true}>
                <Providers>
                    {children}
                </Providers>
            </body>
        </html>
    );
}
