'use client';

import React, { useEffect, useState } from 'react';
import { getExecutiveDashboardMetricsSecure, ExecutiveMetrics } from '@/actions/dashboard-v2';
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, BarChart3, ArrowRight } from 'lucide-react';

export default function ExecutiveDashboard() {
    const [metrics, setMetrics] = useState<ExecutiveMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getExecutiveDashboardMetricsSecure().then(res => {
            if (res.success && res.data) {
                setMetrics(res.data);
            }
            setLoading(false);
        });
    }, []);

    if (loading) return <div className="p-10 text-center animate-pulse">Cargando métricas ejecutivas...</div>;
    if (!metrics) return <div className="p-10 text-center text-slate-500">No hay datos disponibles</div>;

    const fmtMoney = (n: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(n);
    const fmtGrowth = (n: number) => {
        const color = n >= 0 ? 'text-emerald-500' : 'text-rose-500';
        const Icon = n >= 0 ? TrendingUp : TrendingDown;
        return (
            <div className={`flex items-center gap-1 text-sm font-medium ${color}`}>
                <Icon size={16} />
                <span>{Math.abs(n).toFixed(1)}%</span>
            </div>
        );
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* KPI Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <KPICard
                    title="Ingresos Mensuales"
                    value={fmtMoney(metrics.revenue.current)}
                    sub={`vs ${fmtMoney(metrics.revenue.previous)} mes anterior`}
                    growth={metrics.revenue.growth}
                    icon={<DollarSign className="text-emerald-600" />}
                    bg="bg-emerald-50"
                />
                <KPICard
                    title="Ticket Promedio (AOV)"
                    value={fmtMoney(metrics.aov.current)}
                    sub={`vs ${fmtMoney(metrics.aov.previous)} mes anterior`}
                    growth={metrics.aov.growth}
                    icon={<ShoppingCart className="text-blue-600" />}
                    bg="bg-blue-50"
                />
                <KPICard
                    title="Margen Bruto (Est.)"
                    value={`${metrics.grossProfit.margin.toFixed(1)}%`}
                    sub={`Utilidad: ${fmtMoney(metrics.grossProfit.value)}`}
                    // Margin doesn't define growth directly here but serves as a status
                    growth={metrics.grossProfit.margin > 25 ? 1 : -1}
                    growthLabel={metrics.grossProfit.margin > 25 ? 'Saludable' : 'Bajo'}
                    icon={<BarChart3 className="text-violet-600" />}
                    bg="bg-violet-50"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sales by Location */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <BarChart3 size={18} className="text-slate-400" />
                        Rendimiento por Sucursal
                    </h3>
                    <div className="space-y-4">
                        {metrics.salesByLocation.map((loc, idx) => (
                            <div key={idx} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                    <span className="font-medium text-slate-700">{loc.name}</span>
                                    <span className="font-semibold text-slate-900">{fmtMoney(loc.total)}</span>
                                </div>
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full"
                                        style={{ width: `${(loc.total / metrics.revenue.current) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Recent Sales Feed */}
                <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <ShoppingCart size={18} className="text-slate-400" />
                        Últimas Ventas (Tiempo Real)
                    </h3>
                    <div className="overflow-hidden">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-medium">
                                <tr>
                                    <th className="p-3 rounded-l-lg">Hora</th>
                                    <th className="p-3">Sucursal</th>
                                    <th className="p-3 rounded-r-lg text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {metrics.recentSales.map(sale => (
                                    <tr key={sale.id} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="p-3 text-slate-500">
                                            {new Date(sale.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="p-3 font-medium text-slate-700">{sale.location}</td>
                                        <td className="p-3 text-right font-bold text-emerald-600 flex items-center justify-end gap-1">
                                            {fmtMoney(sale.amount)}
                                            <ArrowRight size={14} className="text-slate-300" />
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

function KPICard({ title, value, sub, growth, growthLabel, icon, bg }: any) {
    const fmtGrowth = (n: number) => {
        if (growthLabel) {
            const color = n > 0 ? 'text-emerald-600 bg-emerald-100' : 'text-rose-600 bg-rose-100';
            return <div className={`px-2 py-0.5 rounded-full text-xs font-bold ${color}`}>{growthLabel}</div>;
        }

        const color = n >= 0 ? 'text-emerald-500' : 'text-rose-500';
        const Icon = n >= 0 ? TrendingUp : TrendingDown;
        return (
            <div className={`flex items-center gap-1 text-sm font-medium ${color}`}>
                <Icon size={16} />
                <span>{Math.abs(n).toFixed(1)}%</span>
            </div>
        );
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-3 rounded-xl ${bg}`}>{icon}</div>
                {fmtGrowth(growth)}
            </div>
            <div>
                <h3 className="text-slate-500 font-medium text-sm mb-1">{title}</h3>
                <div className="text-3xl font-bold text-slate-900 mb-1">{value}</div>
                <div className="text-xs text-slate-400">{sub}</div>
            </div>
        </div>
    );
}
