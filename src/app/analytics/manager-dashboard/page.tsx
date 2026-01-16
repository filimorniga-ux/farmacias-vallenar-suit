'use client';

import React, { useEffect, useState } from 'react';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    ShoppingCart,
    Target,
    MapPin,
    Clock,
    ArrowUpRight,
    ArrowDownRight,
    Search,
    Filter
} from 'lucide-react';
import { getExecutiveDashboardMetricsSecure, ExecutiveMetrics } from '@/actions/dashboard-v2';

export default function ManagerDashboardPage() {
    const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function loadMetrics() {
            setLoading(true);
            const res = await getExecutiveDashboardMetricsSecure();
            if (res.success && res.data) {
                setMetrics(res.data);
            } else {
                setError(res.error || 'Error cargando métricas');
            }
            setLoading(false);
        }
        loadMetrics();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-slate-600 font-medium font-mono animate-pulse">Analizando rendimiento ejecutivo...</p>
                </div>
            </div>
        );
    }

    if (error || !metrics) {
        return (
            <div className="p-8 text-center text-rose-600 font-bold bg-rose-50 rounded-2xl border border-rose-100 m-8">
                {error || 'No se pudieron cargar las métricas'}
            </div>
        );
    }

    const { revenue, aov, grossProfit, salesByLocation, recentSales } = metrics;

    return (
        <div className="p-8 space-y-8 bg-slate-50 min-h-screen">
            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight">Executive Dashboard</h1>
                    <p className="text-slate-500 font-medium">Visualización de KPIs Mensuales y Rendimiento Global</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-6 py-3 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all flex items-center gap-2 shadow-sm">
                        <Filter size={18} /> Filtrar
                    </button>
                    <button className="px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 flex items-center gap-2">
                        <TrendingUp size={18} /> Reporte PDF
                    </button>
                </div>
            </div>

            {/* TOP CARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* REVENUE */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <DollarSign size={24} />
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${revenue.growth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {revenue.growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {Math.abs(revenue.growth).toFixed(1)}%
                        </div>
                    </div>
                    <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">Ingresos de este Mes</h3>
                    <div className="text-3xl font-mono font-black text-slate-900">
                        ${revenue.current.toLocaleString('es-CL')}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">vs. mes anterior: ${revenue.previous.toLocaleString('es-CL')}</p>
                </div>

                {/* AOV */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <ShoppingCart size={24} />
                        </div>
                        <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full ${aov.growth >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                            {aov.growth >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {Math.abs(aov.growth).toFixed(1)}%
                        </div>
                    </div>
                    <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">Ticket Promedio</h3>
                    <div className="text-3xl font-mono font-black text-slate-900">
                        ${Math.round(aov.current).toLocaleString('es-CL')}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Promedio por transacción</p>
                </div>

                {/* MARGIN */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <Target size={24} />
                        </div>
                        <div className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded-full">ESTIMADO</div>
                    </div>
                    <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">Margen de Utilidad</h3>
                    <div className="text-3xl font-mono font-black text-slate-900">
                        {grossProfit.margin.toFixed(1)}%
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Utilidad bruta: ${Math.round(grossProfit.value).toLocaleString('es-CL')}</p>
                </div>

                {/* TOTAL SALES */}
                <div className="bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm hover:shadow-md transition-all group">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl group-hover:scale-110 transition-transform">
                            <TrendingUp size={24} />
                        </div>
                    </div>
                    <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">Transacciones</h3>
                    <div className="text-3xl font-mono font-black text-slate-900">
                        {metrics.revenue.current > 0 ? 'ACTIVO' : 'ESPERANDO'}
                    </div>
                    <p className="text-xs text-slate-400 mt-2">Monitoreo en tiempo real</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* BY LOCATION */}
                <div className="lg:col-span-1 bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden p-8 space-y-6">
                    <div className="flex items-center gap-2 mb-2">
                        <MapPin className="text-rose-500" size={20} />
                        <h3 className="text-xl font-black text-slate-900">Ventas por Ubicación</h3>
                    </div>
                    <div className="space-y-4">
                        {salesByLocation.map((loc, i) => (
                            <div key={i} className="space-y-2">
                                <div className="flex justify-between text-sm font-bold">
                                    <span className="text-slate-700">{loc.name}</span>
                                    <span className="text-indigo-600 font-mono">${loc.total.toLocaleString('es-CL')}</span>
                                </div>
                                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full"
                                        style={{ width: `${(loc.total / revenue.current) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* RECENT SALES */}
                <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-slate-50 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Clock className="text-indigo-500" size={20} />
                            <h3 className="text-xl font-black text-slate-900">Ventas Recientes</h3>
                        </div>
                        <Search className="text-slate-300" size={20} />
                    </div>
                    <div className="flex-1 overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-slate-50 text-[10px] uppercase tracking-widest font-black text-slate-400 px-8">
                                <tr>
                                    <th className="py-4 px-8">ID VENTA</th>
                                    <th className="py-4 px-8">UBICACIÓN</th>
                                    <th className="py-4 px-8">MONTO</th>
                                    <th className="py-4 px-8">FECHA/HORA</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {recentSales.map((sale) => (
                                    <tr key={sale.id} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-4 px-8 font-mono text-xs text-slate-500">#{sale.id.slice(0, 8)}</td>
                                        <td className="py-4 px-8 font-bold text-slate-900 text-sm">{sale.location}</td>
                                        <td className="py-4 px-8">
                                            <span className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg font-black font-mono">
                                                ${sale.amount.toLocaleString('es-CL')}
                                            </span>
                                        </td>
                                        <td className="py-4 px-8 text-xs text-slate-400 font-medium whitespace-nowrap">
                                            {new Date(sale.timestamp).toLocaleString('es-CL')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
