import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

import SessionGuard from '@/presentation/components/security/SessionGuard';
import { Toaster } from 'sonner';

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

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className={inter.className} suppressHydrationWarning={true}>
                <SessionGuard>
                    {children}
                    <Toaster richColors position="top-center" closeButton />
                </SessionGuard>
            </body>
        </html>
    );
}
