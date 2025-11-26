
// src/App.tsx (Simulación de Router Layout para Next.js)

import React, { ReactNode } from 'react';
import { Clock, LogOut, Home, User, DollarSign, Package } from 'lucide-react';
import { usePharmaStore, Role } from './presentation/store/useStore'; // Asegurar la importación correcta
import LandingPage from './presentation/pages/LandingPage';

interface SidebarLayoutProps {
    children: ReactNode;
    userRole: Role;
}

// Este Layout simula la protección de rutas
const SidebarLayout: React.FC<SidebarLayoutProps> = ({ children, userRole }) => {
    const { user } = usePharmaStore();

    const navLinks = [
        { name: 'Dashboard', href: '/', icon: Home, roles: ['ADMIN', 'QF', 'VENDEDOR', 'WAREHOUSE'] },
        { name: 'Punto de Venta', href: '/pos', icon: DollarSign, roles: ['ADMIN', 'QF', 'VENDEDOR'] },
        { name: 'Logística', href: '/supply', icon: Package, roles: ['ADMIN', 'QF', 'WAREHOUSE'] },
        { name: 'RRHH', href: '/hr', icon: User, roles: ['ADMIN'] },
        { name: 'Finanzas', href: '/finance', icon: DollarSign, roles: ['ADMIN'] },
        { name: 'Reloj Control', href: '/access', icon: Clock, roles: ['ADMIN', 'QF', 'VENDEDOR', 'WAREHOUSE'] },
    ];

    const visibleLinks = navLinks.filter(link => link.roles.includes(userRole));

    return (
        <div className="flex h-screen bg-slate-100">
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white p-6 flex flex-col">
                <h1 className="text-2xl font-bold text-cyan-400 mb-8">PharmaSuit v2.1</h1>
                <nav className="flex-1 space-y-2">
                    {visibleLinks.map(link => (
                        <a key={link.name} href={link.href} className="flex items-center p-3 rounded-xl text-slate-300 hover:bg-slate-800 transition">
                            <link.icon size={20} className="mr-3" />
                            {link.name}
                        </a>
                    ))}
                </nav>
                <div className="mt-auto pt-4 border-t border-slate-700">
                    <p className="text-sm text-slate-400 mb-2">Bienvenido, {user?.name}</p>
                    <button className="flex items-center text-red-400 hover:text-red-300 transition">
                        <LogOut size={16} className="mr-2" /> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Contenido Principal */}
            <main className="flex-1 overflow-y-auto">
                {children}
            </main>
        </div>
    );
};

// NOTA: En Next.js, esto sería el Layout.tsx y middleware.ts. 
// Aquí solo se muestra la estructura de envoltura.

export default function AppRouter() {
    return (
        <LandingPage />
    )
}
