'use client';

import Link from 'next/link';
import { LayoutDashboard, ShoppingCart, Truck, Users, Settings, LogOut, Lock, DollarSign, Package, Thermometer, Receipt, AlertTriangle, FileText, Globe, Clock } from 'lucide-react';
import { useAuthStore } from '@/lib/store/useAuthStore';
import { useRouter } from 'next/navigation';
import RouteGuard from '@/components/auth/RouteGuard';
import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { getDashboardMetrics, DashboardMetrics } from '@/actions/dashboard';

export default function Dashboard() {
    const { user, role, logout } = useAuthStore();
    const router = useRouter();
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadMetrics = async () => {
            try {
                const data = await getDashboardMetrics();
                setMetrics(data);
            } catch (error) {
                console.error('Failed to load metrics', error);
            } finally {
                setLoading(false);
            }
        };
        loadMetrics();
    }, []);

    const handleLogout = () => {
        logout();
        router.push('/login');
    };

    // RBAC Logic
    const isModuleLocked = (moduleName: string) => {
        if (role === 'ADMIN') return false;
        if (role === 'QF') {
            return ['Finanzas', 'RRHH'].includes(moduleName);
        }
        if (role === 'VENDEDOR') {
            return ['Finanzas', 'RRHH', 'Logistica', 'Configuracion'].includes(moduleName);
        }
        return true;
    };

    const modules = [
        {
            name: 'Punto de Venta',
            icon: ShoppingCart,
            href: '/caja',
            color: 'bg-blue-600',
            description: 'Caja y Ventas',
            id: 'Caja'
        },
        {
            name: 'Logística',
            icon: Truck,
            href: '/proveedores',
            color: 'bg-orange-500',
            description: 'Inventario',
            id: 'Logistica'
        },
        {
            name: 'Finanzas',
            icon: LayoutDashboard,
            href: '/finanzas',
            color: 'bg-green-600',
            description: 'Contabilidad',
            id: 'Finanzas'
        },
        {
            name: 'RRHH',
            icon: Users,
            href: '/rrhh',
            color: 'bg-purple-600',
            description: 'Personal',
            id: 'RRHH'
        },
        {
            name: 'Web Pública',
            icon: Globe,
            href: '/web',
            color: 'bg-cyan-500',
            description: 'Vista Cliente',
            id: 'Web'
        },
        {
            name: 'Configuración',
            icon: Settings,
            href: '/settings',
            color: 'bg-gray-600',
            description: 'Ajustes',
            id: 'Configuracion'
        }
    ];

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    return (
        <RouteGuard>
            <div className="min-h-screen bg-slate-50">
                {/* Header */}
                <header className="bg-white shadow-sm sticky top-0 z-10">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-600 p-2 rounded-lg">
                                <LayoutDashboard className="text-white" size={24} />
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-gray-900">Farmacias Vallenar</h1>
                                <p className="text-xs text-gray-500">Panel de Control</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-gray-900">Hola, {user?.username} 👋</p>
                                <p className="text-xs text-gray-500">
                                    Turno: <span className="text-green-600 font-medium">Mañana</span> | {role}
                                </p>
                            </div>
                            <button
                                onClick={handleLogout}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                                <LogOut size={18} />
                                <span className="hidden sm:inline">Salir</span>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    {/* KPI Section */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        {/* Sales Today */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-green-100 text-green-600 rounded-lg">
                                    <DollarSign size={24} />
                                </div>
                                <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-1 rounded-full">
                                    +12% vs ayer
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Ventas Hoy</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loading ? '...' : formatCurrency(metrics?.salesToday || 0)}
                            </h3>
                        </div>

                        {/* Critical Stock */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-red-100 text-red-600 rounded-lg">
                                    <Package size={24} />
                                </div>
                                {metrics?.criticalStock ? (
                                    <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-1 rounded-full animate-pulse">
                                        Acción req.
                                    </span>
                                ) : null}
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Stock Crítico</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loading ? '...' : metrics?.criticalStock} <span className="text-sm font-normal text-gray-400">productos</span>
                            </h3>
                        </div>

                        {/* Cold Chain */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-blue-100 text-blue-600 rounded-lg">
                                    <Thermometer size={24} />
                                </div>
                                <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                                    2°C - 8°C
                                </span>
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Cadena de Frío</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loading ? '...' : metrics?.coldChainStatus}
                            </h3>
                        </div>

                        {/* Tickets */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 bg-purple-100 text-purple-600 rounded-lg">
                                    <Receipt size={24} />
                                </div>
                            </div>
                            <p className="text-sm text-gray-500 mb-1">Boletas Emitidas</p>
                            <h3 className="text-2xl font-bold text-gray-900">
                                {loading ? '...' : metrics?.ticketCount}
                            </h3>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Module Grid (2/3 width) */}
                        <div className="lg:col-span-2">
                            <h2 className="text-lg font-bold text-gray-900 mb-4">Accesos Directos</h2>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {modules.map((module) => {
                                    const locked = isModuleLocked(module.id);
                                    return (
                                        <div key={module.name} className="relative group">
                                            {locked ? (
                                                <div className="h-full p-4 bg-white rounded-xl shadow-sm border border-gray-100 opacity-50 cursor-not-allowed flex flex-col items-center text-center relative overflow-hidden">
                                                    <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/30 backdrop-blur-[1px]">
                                                        <Lock className="text-gray-400" size={24} />
                                                    </div>
                                                    <div className={`w-10 h-10 ${module.color} rounded-lg flex items-center justify-center text-white mb-3`}>
                                                        <module.icon size={20} />
                                                    </div>
                                                    <h3 className="font-semibold text-gray-900 text-sm">{module.name}</h3>
                                                </div>
                                            ) : (
                                                <Link
                                                    href={module.href}
                                                    className="h-full block p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all hover:-translate-y-1 flex flex-col items-center text-center"
                                                >
                                                    <div className={`w-10 h-10 ${module.color} rounded-lg flex items-center justify-center text-white mb-3 shadow-sm`}>
                                                        <module.icon size={20} />
                                                    </div>
                                                    <h3 className="font-semibold text-gray-900 text-sm">{module.name}</h3>
                                                    <p className="text-xs text-gray-500 mt-1">{module.description}</p>
                                                </Link>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Sidebar (1/3 width) */}
                        <div className="lg:col-span-1 space-y-6">

                            {/* Operations Widget */}
                            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                                    <Clock className="text-blue-600" size={20} />
                                    Control de Operaciones
                                </h3>

                                {/* Shift Toggle */}
                                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-6">
                                    <div>
                                        <p className="font-medium text-gray-900">Estado de Turno</p>
                                        <p className="text-xs text-gray-500">Visible en web pública</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            className="sr-only peer"
                                            onChange={async (e) => {
                                                const { toggleShift } = await import('@/actions/operations');
                                                await toggleShift(e.target.checked);
                                            }}
                                        />
                                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                    </label>
                                </div>

                                {/* Time Clock */}
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={async () => {
                                            if (!user?.id) return;
                                            const { clockIn } = await import('@/actions/operations');
                                            const res = await clockIn(user.id);
                                            if (res.success) alert('Entrada marcada correctamente');
                                            else alert(res.error);
                                        }}
                                        className="flex flex-col items-center justify-center p-3 bg-green-50 text-green-700 rounded-xl hover:bg-green-100 transition-colors border border-green-200"
                                    >
                                        <span className="text-2xl font-bold">Entrada</span>
                                        <span className="text-xs">Marcar</span>
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!user?.id) return;
                                            const { clockOut } = await import('@/actions/operations');
                                            const res = await clockOut(user.id);
                                            if (res.success) alert('Salida marcada correctamente');
                                            else alert(res.error);
                                        }}
                                        className="flex flex-col items-center justify-center p-3 bg-red-50 text-red-700 rounded-xl hover:bg-red-100 transition-colors border border-red-200"
                                    >
                                        <span className="text-2xl font-bold">Salida</span>
                                        <span className="text-xs">Marcar</span>
                                    </button>
                                </div>
                            </div>

                            {/* Alert Panel */}
                            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                                <div className="p-4 border-b border-gray-50">
                                    <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                                        <AlertTriangle size={16} className="text-orange-500" />
                                        Acciones Requeridas
                                    </h3>
                                </div>
                                <div className="divide-y divide-gray-50">
                                    {loading ? (
                                        <div className="p-4 text-center text-sm text-gray-500">Cargando alertas...</div>
                                    ) : (
                                        <>
                                            {metrics?.expiringBatches ? (
                                                <Link href="/proveedores" className="block p-4 hover:bg-orange-50 transition-colors">
                                                    <div className="flex items-start gap-3">
                                                        <div className="mt-1">
                                                            <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-gray-900">
                                                                {metrics.expiringBatches} Lotes por vencer
                                                            </p>
                                                            <p className="text-xs text-gray-500 mt-1">
                                                                Vencen en los próximos 30 días. Revisar inventario.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </Link>
                                            ) : null}

                                            <div className="p-4 bg-gray-50">
                                                <p className="text-xs text-center text-gray-400">
                                                    No hay más alertas pendientes
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        </RouteGuard>
    );
}
