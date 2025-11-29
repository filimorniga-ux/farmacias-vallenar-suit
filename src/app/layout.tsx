import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
    title: 'Farmacias Vallenar Suit',
    description: 'Sistema integral de gestión farmacéutica para Farmacias Vallenar',
    manifest: '/manifest.json',
    themeColor: '#0e7490',
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="es">
            <body className={inter.className}>{children}</body>
        </html>
    );
}
