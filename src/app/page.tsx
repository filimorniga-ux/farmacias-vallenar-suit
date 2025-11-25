'use client';

import Link from 'next/link';
import { ShoppingCart, PackageSearch, Users, DollarSign, Settings, LogOut, Lock } from 'lucide-react';
import { useAuthStore, UserRole } from '@/lib/store/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HomePage() {
    const { user, isAuthenticated, logout } = useAuthStore();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (!isAuthenticated) {
            router.push('/login');
        }
    }, [isAuthenticated, router]);

    if (!mounted || !isAuthenticated) return null;

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    const isModuleEnabled = (moduleHref: string, role: UserRole) => {
        if (role === 'ADMIN') return true;

        if (role === 'QUIMICO') {
            return ['/logistica', '/caja'].includes(moduleHref);
        }

        if (role === 'VENDEDOR') {
            // Seller can access POS and Logistics (Read-only handled in page)
            return ['/caja', '/logistica'].includes(moduleHref);
        }

        return false;
    };

    const modules = [
        {
            title: 'Caja (POS)',
            description: 'Punto de venta y emisión de boletas',
            href: '/caja',
            icon: ShoppingCart,
            color: 'bg-blue-500 hover:bg-blue-600',
        },
        {
            title: 'Logística',
            description: 'Inventario y cadena de suministro',
            href: '/logistica',
            icon: PackageSearch,
            color: 'bg-purple-500 hover:bg-purple-600',
        },
        {
            title: 'Recursos Humanos',
            description: 'Gestión de personal y nóminas',
            href: '/rrhh',
            icon: Users,
            color: 'bg-green-500 hover:bg-green-600',
        },
        {
            title: 'Finanzas',
            description: 'Control de caja y reportes',
            href: '/finanzas',
            icon: DollarSign,
            color: 'bg-amber-500 hover:bg-amber-600',
        },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="max-w-7xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="flex justify-between items-start mb-12">
                    <div className="text-left">
                        <h1 className="text-4xl font-black text-gray-900 mb-2">
                            Farmacias Vallenar
                        </h1>
                        <p className="text-lg text-gray-600">
                            Bienvenido, <span className="font-bold text-blue-600">{user?.name}</span> ({user?.role})
                        </p>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 bg-white text-red-600 rounded-lg shadow hover:bg-red-50 transition-colors"
                    >
                        <LogOut size={18} />
                        Cerrar Sesión
                    </button>
                </div>

                {/* Modules Grid */}
                <div className="grid md:grid-cols-2 gap-6 mb-8">
                    {modules.map((module) => {
                        const Icon = module.icon;
                        const enabled = isModuleEnabled(module.href, user!.role);

                        if (enabled) {
                            return (
                                <Link
                                    key={module.href}
                                    href={module.href}
                                    className={`${module.color} text-white p-8 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 group`}
                                >
                                    <div className="flex items-start gap-4">
                                        <div className="bg-white/20 p-4 rounded-xl group-hover:bg-white/30 transition-colors">
                                            <Icon size={32} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold mb-2">{module.title}</h2>
                                            <p className="text-white/90">{module.description}</p>
                                        </div>
                                    </div>
                                </Link>
                            );
                        } else {
                            return (
                                <div
                                    key={module.href}
                                    className="bg-gray-100 text-gray-400 p-8 rounded-2xl border border-gray-200 cursor-not-allowed relative overflow-hidden"
                                >
                                    <div className="absolute top-4 right-4">
                                        <Lock size={24} className="text-gray-300" />
                                    </div>
                                    <div className="flex items-start gap-4 opacity-50">
                                        <div className="bg-gray-200 p-4 rounded-xl">
                                            <Icon size={32} />
                                        </div>
                                        <div>
                                            <h2 className="text-2xl font-bold mb-2">{module.title}</h2>
                                            <p className="text-gray-500">{module.description}</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        }
                    })}
                </div>

                {/* Settings Link */}
                <div className="text-center">
                    <Link
                        href="/settings"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-colors"
                    >
                        <Settings size={20} />
                        Configuración del Sistema
                    </Link>
                </div>
            </div>
        </div>
    );
}
