'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
    TrendingUp, TrendingDown, DollarSign, BarChart3, Filter,
    Loader2, RefreshCw, ArrowUpRight, ArrowDownRight, Equal,
    Package, Calendar, ChevronDown, ArrowLeft
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getPriceCostDashboard,
    getPriceCostHistory,
    type PriceCostHistoryEntry,
    type PriceDashboardSummary,
} from '@/actions/pricing-v2';

const PERIODS = [
    { label: 'Hoy', value: 'today' },
    { label: '7 días', value: '7d' },
    { label: '15 días', value: '15d' },
    { label: '30 días', value: '30d' },
    { label: 'Trimestre', value: '90d' },
    { label: 'Semestre', value: '180d' },
];

const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('es-CL', {
        timeZone: 'America/Santiago',
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
    });

export default function CostMonitorPage() {
    const router = useRouter();
    const [period, setPeriod] = useState('30d');
    const [isLoading, setIsLoading] = useState(true);
    const [summary, setSummary] = useState<PriceDashboardSummary | null>(null);
    const [history, setHistory] = useState<PriceCostHistoryEntry[]>([]);
    const [showFilters, setShowFilters] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [dashRes, histRes] = await Promise.all([
                getPriceCostDashboard(period),
                getPriceCostHistory(undefined, period, 100),
            ]);

            if (dashRes.success && dashRes.data) setSummary(dashRes.data);
            if (histRes.success && histRes.data) setHistory(histRes.data);
        } catch (error) {
            toast.error('Error al cargar datos de monitoreo');
        } finally {
            setIsLoading(false);
        }
    }, [period]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-sky-600" size={48} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Navigation Bar */}
            <nav className="sticky top-0 z-40 bg-white/90 backdrop-blur-lg border-b border-slate-200/60 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-3 flex items-center gap-3">
                    <button
                        onClick={() => window.history.length > 1 ? router.back() : router.push('/dashboard')}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        <ArrowLeft size={18} />
                        <span className="hidden sm:inline">Volver al sistema</span>
                        <span className="sm:hidden">Volver</span>
                    </button>
                    <div className="h-5 w-px bg-slate-200" />
                    <span className="text-sm font-semibold text-slate-400">Monitor de Costos y Precios</span>
                </div>
            </nav>

            <div className="max-w-7xl mx-auto space-y-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-3 rounded-xl text-white shadow-lg shadow-amber-200">
                            <BarChart3 size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Monitor de Costos y Precios</h1>
                            <p className="text-sm text-slate-500">Seguimiento de cambios en tiempo real</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={loadData} className="p-2.5 text-slate-500 hover:bg-white rounded-xl border border-slate-200 transition-colors">
                            <RefreshCw size={18} />
                        </button>
                    </div>
                </div>

                {/* Period selector */}
                <div className="flex flex-wrap gap-2">
                    {PERIODS.map(p => (
                        <button
                            key={p.value}
                            onClick={() => setPeriod(p.value)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                period === p.value
                                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-200'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:border-sky-300'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <DollarSign size={16} className="text-slate-400" />
                            <p className="text-xs font-bold text-slate-500 uppercase">Total Cambios</p>
                        </div>
                        <p className="text-2xl font-bold text-slate-800">{summary?.totalChanges || 0}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-red-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <ArrowUpRight size={16} className="text-red-500" />
                            <p className="text-xs font-bold text-red-500 uppercase">Subieron</p>
                        </div>
                        <p className="text-2xl font-bold text-red-600">{summary?.costIncreases || 0}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-emerald-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <ArrowDownRight size={16} className="text-emerald-500" />
                            <p className="text-xs font-bold text-emerald-500 uppercase">Bajaron</p>
                        </div>
                        <p className="text-2xl font-bold text-emerald-600">{summary?.costDecreases || 0}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-sky-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp size={16} className="text-sky-500" />
                            <p className="text-xs font-bold text-sky-500 uppercase">Precios</p>
                        </div>
                        <p className="text-2xl font-bold text-sky-600">{summary?.priceChanges || 0}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-purple-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <Equal size={16} className="text-purple-500" />
                            <p className="text-xs font-bold text-purple-500 uppercase">Nivelados</p>
                        </div>
                        <p className="text-2xl font-bold text-purple-600">{summary?.levelings || 0}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-amber-100 shadow-sm hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-2 mb-2">
                            <BarChart3 size={16} className="text-amber-500" />
                            <p className="text-xs font-bold text-amber-500 uppercase">Δ% Prom.</p>
                        </div>
                        <p className="text-2xl font-bold text-amber-600">{summary?.avgChangePercent || 0}%</p>
                    </div>
                </div>

                {/* Top changes side by side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Top increases */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                            <h3 className="font-bold text-red-800 flex items-center gap-2 text-sm">
                                <TrendingUp size={16} /> Mayores Subidas de Costo
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                            {(summary?.topIncreases || []).length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">Sin datos en este período</div>
                            ) : (
                                summary?.topIncreases.map((item, i) => (
                                    <div key={item.id || i} className="px-4 py-2.5 flex items-center gap-3">
                                        <span className="text-xs font-bold text-red-500 w-10">+{Number(item.change_percent).toFixed(1)}%</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{item.product_name}</p>
                                            <p className="text-xs text-slate-500">{item.sku}</p>
                                        </div>
                                        <div className="text-right text-sm">
                                            <span className="text-slate-400 line-through">{formatCLP(item.old_value)}</span>
                                            <span className="text-red-600 font-bold ml-2">{formatCLP(item.new_value)}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Top decreases */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                            <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                                <TrendingDown size={16} /> Mayores Bajadas de Costo
                            </h3>
                        </div>
                        <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                            {(summary?.topDecreases || []).length === 0 ? (
                                <div className="p-8 text-center text-slate-400 text-sm">Sin datos en este período</div>
                            ) : (
                                summary?.topDecreases.map((item, i) => (
                                    <div key={item.id || i} className="px-4 py-2.5 flex items-center gap-3">
                                        <span className="text-xs font-bold text-emerald-500 w-10">{Number(item.change_percent).toFixed(1)}%</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{item.product_name}</p>
                                            <p className="text-xs text-slate-500">{item.sku}</p>
                                        </div>
                                        <div className="text-right text-sm">
                                            <span className="text-slate-400 line-through">{formatCLP(item.old_value)}</span>
                                            <span className="text-emerald-600 font-bold ml-2">{formatCLP(item.new_value)}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Full history table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                            <Calendar size={16} className="text-slate-500" />
                            Historial Completo ({history.length})
                        </h3>
                        <button
                            onClick={() => setShowFilters(!showFilters)}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
                        >
                            <Filter size={12} /> Filtros
                            <ChevronDown size={12} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                    </div>

                    {history.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Package size={48} className="mx-auto mb-3 opacity-50" />
                            <p className="font-semibold">Sin cambios registrados</p>
                            <p className="text-sm">Los cambios de costo se registran al recibir órdenes de compra</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">Fecha</th>
                                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">Producto</th>
                                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">Tipo</th>
                                        <th className="p-3 text-right text-xs font-bold text-slate-500 uppercase">Anterior</th>
                                        <th className="p-3 text-right text-xs font-bold text-slate-500 uppercase">Nuevo</th>
                                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">Δ%</th>
                                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">Fuente</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {history.map((entry, i) => {
                                        const isUp = entry.new_value > entry.old_value;
                                        const isLeveling = entry.change_type === 'PRICE_LEVELING';
                                        const isGenerated = entry.change_type === 'COST_GENERATED';

                                        return (
                                            <tr key={entry.id || i} className="hover:bg-slate-50/50 transition-colors">
                                                <td className="p-3 text-xs text-slate-500 whitespace-nowrap">
                                                    {formatDate(entry.created_at)}
                                                </td>
                                                <td className="p-3">
                                                    <p className="text-sm font-semibold text-slate-800 truncate max-w-xs">{entry.product_name}</p>
                                                    <p className="text-xs text-slate-400">{entry.sku}</p>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                                        isLeveling ? 'bg-purple-100 text-purple-700' :
                                                        isGenerated ? 'bg-sky-100 text-sky-700' :
                                                        isUp ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                                    }`}>
                                                        {isLeveling ? 'Nivelado' : isGenerated ? 'Generado' : isUp ? 'Subida' : 'Bajada'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-right text-sm text-slate-500">{formatCLP(entry.old_value)}</td>
                                                <td className="p-3 text-right text-sm font-bold text-slate-800">{formatCLP(entry.new_value)}</td>
                                                <td className="p-3 text-center">
                                                    <span className={`text-xs font-bold ${
                                                        isUp ? 'text-red-500' : 'text-emerald-500'
                                                    }`}>
                                                        {Number(entry.change_percent) > 0 ? '+' : ''}{Number(entry.change_percent).toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className="text-[10px] font-semibold text-slate-400 uppercase">
                                                        {entry.source === 'RECEPTION' ? 'OC' :
                                                         entry.source === 'LEVELING' ? 'Nivelar' :
                                                         entry.source === 'BULK_GENERATE' ? 'Auto' : entry.source}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
