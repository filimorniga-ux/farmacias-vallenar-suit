'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    TrendingUp, TrendingDown, DollarSign, BarChart3,
    Loader2, RefreshCw, ArrowUpRight, ArrowDownRight, Equal,
    Package, Calendar, ChevronDown, CheckCircle2, XCircle,
    AlertTriangle, Layers, Building2, ArrowRight, Zap, Shield,
    Download, Printer
} from 'lucide-react';
import { toast } from 'sonner';
import {
    getPriceCostDashboard,
    getPriceCostHistory,
    type PriceCostHistoryEntry,
    type PriceDashboardSummary,
} from '@/actions/pricing-v2';
import {
    getPendingRecommendations,
    getRecommendationHistory,
    getSupplierPriceOverview,
    resolveRecommendation,
    type PriceRecommendation,
} from '@/actions/pricing-intelligence';
import {
    exportDashboardExcel, exportRecommendationsExcel,
    exportSuppliersExcel, exportHistoryExcel,
    printDashboardPDF, printRecommendationsPDF,
    printSuppliersPDF, printHistoryPDF,
} from '@/lib/cost-monitor-exports';

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

type Tab = 'dashboard' | 'recommendations' | 'suppliers' | 'history';

const REC_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
    RAISE_PRICE: { icon: TrendingUp, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', label: 'Subir Precio' },
    KEEP_PRICE: { icon: Shield, color: 'text-sky-600', bg: 'bg-sky-50', border: 'border-sky-200', label: 'Mantener Precio' },
    LOWER_PRICE: { icon: TrendingDown, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Bajar Precio' },
    LEVEL_PRICE: { icon: Equal, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-200', label: 'Nivelar Precio' },
    FINISH_OLD_STOCK: { icon: Layers, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Terminar Stock' },
    SWITCH_SUPPLIER: { icon: Building2, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-200', label: 'Cambiar Proveedor' },
};

export default function CostMonitorPage() {
    const [period, setPeriod] = useState('30d');
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    const [summary, setSummary] = useState<PriceDashboardSummary | null>(null);
    const [history, setHistory] = useState<PriceCostHistoryEntry[]>([]);
    const [recommendations, setRecommendations] = useState<PriceRecommendation[]>([]);
    const [resolvedRecs, setResolvedRecs] = useState<PriceRecommendation[]>([]);
    const [supplierOverview, setSupplierOverview] = useState<any[]>([]);
    const [resolvingId, setResolvingId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [dashRes, histRes, recsRes, resolvedRes, suppRes] = await Promise.all([
                getPriceCostDashboard(period),
                getPriceCostHistory(undefined, period, 100),
                getPendingRecommendations(),
                getRecommendationHistory(),
                getSupplierPriceOverview(),
            ]);

            if (dashRes.success && dashRes.data) setSummary(dashRes.data);
            if (histRes.success && histRes.data) setHistory(histRes.data);
            if (recsRes.success && recsRes.data) setRecommendations(recsRes.data);
            if (resolvedRes.success && resolvedRes.data) setResolvedRecs(resolvedRes.data);
            if (suppRes.success && suppRes.data) setSupplierOverview(suppRes.data);
        } catch {
            toast.error('Error al cargar datos de monitoreo');
        } finally {
            setIsLoading(false);
        }
    }, [period]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleResolve = async (id: string, action: 'ACCEPTED' | 'REJECTED') => {
        setResolvingId(id);
        try {
            const res = await resolveRecommendation(id, action);
            if (res.success) {
                toast.success(action === 'ACCEPTED' ? '✅ Recomendación aplicada' : '⏭️ Recomendación descartada');
                loadData();
            } else {
                toast.error(res.error || 'Error al resolver');
            }
        } catch {
            toast.error('Error al procesar');
        } finally {
            setResolvingId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <Loader2 className="animate-spin text-amber-500 mx-auto mb-3" size={48} />
                    <p className="text-sm text-slate-500 font-medium">Cargando inteligencia de precios…</p>
                </div>
            </div>
        );
    }

    const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
        { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
        { id: 'recommendations', label: 'Alertas', icon: Zap, count: recommendations.length },
        { id: 'suppliers', label: 'Proveedores', icon: Building2, count: supplierOverview.length },
        { id: 'history', label: 'Historial', icon: Calendar, count: history.length },
    ];

    return (
        <div className="h-full bg-slate-50 overflow-y-auto">
            <div className="max-w-7xl mx-auto space-y-4 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-2.5 rounded-xl text-white shadow-lg shadow-amber-200">
                            <BarChart3 size={24} />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-800">Monitor de Costos y Precios</h1>
                            <p className="text-xs text-slate-500">Inteligencia de precios • Comparación de proveedores</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {recommendations.length > 0 && (
                            <span className="bg-red-500 text-white text-xs font-bold px-2.5 py-1 rounded-full animate-pulse">
                                {recommendations.length} alerta{recommendations.length > 1 ? 's' : ''}
                            </span>
                        )}
                        <button onClick={loadData} aria-label="Actualizar datos" className="min-h-11 min-w-11 p-2 text-slate-500 hover:bg-white rounded-xl border border-slate-200 transition-colors" title="Actualizar">
                            <RefreshCw size={16} aria-hidden="true" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-1 bg-white rounded-xl p-1 border border-slate-200 shadow-sm overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            type="button"
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex min-h-11 items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                                activeTab === tab.id
                                    ? 'bg-amber-500 text-white shadow-sm'
                                    : 'text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                                }`}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Period selector (visible on dashboard) */}
                {activeTab === 'dashboard' && (
                    <div className="flex flex-wrap gap-2">
                        {PERIODS.map(p => (
                            <button
                                type="button"
                                key={p.value}
                                onClick={() => setPeriod(p.value)}
                                className={`min-h-11 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                    period === p.value
                                        ? 'bg-sky-500 text-white shadow-sm'
                                        : 'bg-white text-slate-600 border border-slate-200 hover:border-sky-300'
                                }`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* ========== DASHBOARD TAB ========== */}
                {activeTab === 'dashboard' && (
                    <>
                        {/* Export Actions */}
                        <div className="flex justify-end gap-2">
                            <button
                                disabled={exporting}
                                aria-label="Descargar Dashboard en Excel"
                                aria-busy={exporting}
                                onClick={async () => {
                                    if (!summary) return;
                                    setExporting(true);
                                    try {
                                        const pl = PERIODS.find(p => p.value === period)?.label || period;
                                        await exportDashboardExcel(summary, pl);
                                        toast.success('✅ Excel descargado');
                                    } catch { toast.error('Error al exportar'); }
                                    finally { setExporting(false); }
                                }}
                                className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                                {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                                Excel
                            </button>
                            <button
                                disabled={exporting}
                                aria-label="Descargar Dashboard en PDF"
                                aria-busy={exporting}
                                onClick={async () => {
                                    if (!summary) return;
                                    setExporting(true);
                                    try {
                                        const pl = PERIODS.find(p => p.value === period)?.label || period;
                                        printDashboardPDF(summary, pl);
                                        toast.success('📄 PDF generado');
                                    } catch {
                                        toast.error('Error al generar PDF');
                                    } finally {
                                        setExporting(false);
                                    }
                                }}
                                className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-50"
                            >
                                {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Printer size={13} aria-hidden="true" />} PDF
                            </button>
                        </div>
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                            <div className="bg-white rounded-xl p-3 border border-slate-200 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <DollarSign size={14} className="text-slate-400" />
                                    <p className="text-[10px] font-bold text-slate-500 uppercase">Total</p>
                                </div>
                                <p className="text-xl font-bold text-slate-800">{summary?.totalChanges || 0}</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-red-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <ArrowUpRight size={14} className="text-red-500" />
                                    <p className="text-[10px] font-bold text-red-500 uppercase">Subieron</p>
                                </div>
                                <p className="text-xl font-bold text-red-600">{summary?.costIncreases || 0}</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-emerald-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <ArrowDownRight size={14} className="text-emerald-500" />
                                    <p className="text-[10px] font-bold text-emerald-500 uppercase">Bajaron</p>
                                </div>
                                <p className="text-xl font-bold text-emerald-600">{summary?.costDecreases || 0}</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-sky-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <TrendingUp size={14} className="text-sky-500" />
                                    <p className="text-[10px] font-bold text-sky-500 uppercase">Precios</p>
                                </div>
                                <p className="text-xl font-bold text-sky-600">{summary?.priceChanges || 0}</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-purple-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <Equal size={14} className="text-purple-500" />
                                    <p className="text-[10px] font-bold text-purple-500 uppercase">Nivelados</p>
                                </div>
                                <p className="text-xl font-bold text-purple-600">{summary?.levelings || 0}</p>
                            </div>
                            <div className="bg-white rounded-xl p-3 border border-amber-100 shadow-sm">
                                <div className="flex items-center gap-1.5 mb-1.5">
                                    <BarChart3 size={14} className="text-amber-500" />
                                    <p className="text-[10px] font-bold text-amber-500 uppercase">Δ% Prom.</p>
                                </div>
                                <p className="text-xl font-bold text-amber-600">{summary?.avgChangePercent || 0}%</p>
                            </div>
                        </div>

                        {/* Top changes side by side */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-2.5 bg-red-50 border-b border-red-100">
                                    <h3 className="font-bold text-red-800 flex items-center gap-2 text-sm">
                                        <TrendingUp size={14} /> Mayores Subidas de Costo
                                    </h3>
                                </div>
                                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                                    {(summary?.topIncreases || []).length === 0 ? (
                                        <div className="p-6 text-center text-slate-400 text-sm">Sin datos</div>
                                    ) : (
                                        summary?.topIncreases.map((item, i) => (
                                            <div key={item.id || i} className="px-4 py-2 flex items-center gap-3">
                                                <span className="text-xs font-bold text-red-500 w-10">+{Number(item.change_percent).toFixed(1)}%</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{item.product_name}</p>
                                                    <p className="text-[10px] text-slate-400">{item.sku}</p>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <span className="text-slate-400 line-through">{formatCLP(item.old_value)}</span>
                                                    <span className="text-red-600 font-bold ml-1">{formatCLP(item.new_value)}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-100">
                                    <h3 className="font-bold text-emerald-800 flex items-center gap-2 text-sm">
                                        <TrendingDown size={14} /> Mayores Bajadas de Costo
                                    </h3>
                                </div>
                                <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
                                    {(summary?.topDecreases || []).length === 0 ? (
                                        <div className="p-6 text-center text-slate-400 text-sm">Sin datos</div>
                                    ) : (
                                        summary?.topDecreases.map((item, i) => (
                                            <div key={item.id || i} className="px-4 py-2 flex items-center gap-3">
                                                <span className="text-xs font-bold text-emerald-500 w-10">{Number(item.change_percent).toFixed(1)}%</span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{item.product_name}</p>
                                                    <p className="text-[10px] text-slate-400">{item.sku}</p>
                                                </div>
                                                <div className="text-right text-sm">
                                                    <span className="text-slate-400 line-through">{formatCLP(item.old_value)}</span>
                                                    <span className="text-emerald-600 font-bold ml-1">{formatCLP(item.new_value)}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* ========== RECOMMENDATIONS TAB ========== */}
                {activeTab === 'recommendations' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Zap size={18} className="text-amber-500" />
                                Recomendaciones Pendientes
                                {recommendations.length > 0 && (
                                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{recommendations.length}</span>
                                )}
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    disabled={exporting}
                                    aria-label="Descargar Recomendaciones en Excel"
                                    aria-busy={exporting}
                                    onClick={async () => {
                                        setExporting(true);
                                        try {
                                            await exportRecommendationsExcel(recommendations, resolvedRecs);
                                            toast.success('✅ Excel descargado');
                                        } catch { toast.error('Error al exportar'); }
                                        finally { setExporting(false); }
                                    }}
                                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                >
                                    {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                                    Excel
                                </button>
                                <button
                                    disabled={exporting}
                                    aria-label="Descargar Recomendaciones en PDF"
                                    aria-busy={exporting}
                                    onClick={async () => {
                                        setExporting(true);
                                        try {
                                            printRecommendationsPDF(recommendations, resolvedRecs);
                                            toast.success('📄 PDF generado');
                                        } catch {
                                            toast.error('Error al generar PDF');
                                        } finally {
                                            setExporting(false);
                                        }
                                    }}
                                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-50"
                                >
                                    {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Printer size={13} aria-hidden="true" />} PDF
                                </button>
                            </div>
                        </div>

                        {recommendations.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <CheckCircle2 size={48} className="mx-auto mb-3 text-emerald-300" />
                                <p className="text-slate-600 font-semibold">No hay alertas pendientes</p>
                                <p className="text-sm text-slate-400 mt-1">Las recomendaciones se generan al recibir órdenes de compra con cambios de costo</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {recommendations.map(rec => {
                                    const config = REC_CONFIG[rec.recommendation_type] || REC_CONFIG.KEEP_PRICE;
                                    const Icon = config.icon;
                                    return (
                                        <div key={rec.id} className={`bg-white rounded-xl border ${config.border} shadow-sm overflow-hidden`}>
                                            <div className={`px-4 py-2.5 ${config.bg} flex items-center justify-between`}>
                                                <div className="flex items-center gap-2">
                                                    <Icon size={16} className={config.color} />
                                                    <span className={`text-xs font-bold uppercase ${config.color}`}>{config.label}</span>
                                                </div>
                                                <span className="text-[10px] text-slate-400">{formatDate(rec.created_at)}</span>
                                            </div>
                                            <div className="p-4 space-y-3">
                                                <div className="flex items-start gap-3">
                                                    <div className="flex-1">
                                                        <p className="text-sm font-bold text-slate-800">{rec.product_name}</p>
                                                        <p className="text-[10px] text-slate-400">{rec.sku}</p>
                                                        <p className="text-sm text-slate-600 mt-1.5">{rec.reason}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-3 text-xs">
                                                    <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                                                        <span className="text-slate-400">Costo: </span>
                                                        <span className="font-bold text-slate-700">{formatCLP(rec.current_cost || 0)}</span>
                                                        <ArrowRight size={10} className="inline mx-1 text-slate-300" />
                                                        <span className="font-bold text-slate-800">{formatCLP(rec.suggested_cost || 0)}</span>
                                                    </div>
                                                    {rec.current_price > 0 && (
                                                        <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                                                            <span className="text-slate-400">Venta: </span>
                                                            <span className="font-bold text-slate-700">{formatCLP(rec.current_price)}</span>
                                                            {rec.suggested_price !== rec.current_price && (
                                                                <>
                                                                    <ArrowRight size={10} className="inline mx-1 text-slate-300" />
                                                                    <span className="font-bold text-emerald-600">{formatCLP(rec.suggested_price || 0)}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    {rec.margin_current > 0 && (
                                                        <div className="bg-slate-50 rounded-lg px-2.5 py-1.5">
                                                            <span className="text-slate-400">Margen: </span>
                                                            <span className={`font-bold ${rec.margin_current < 15 ? 'text-red-600' : 'text-emerald-600'}`}>
                                                                {Number(rec.margin_current).toFixed(1)}%
                                                            </span>
                                                            {rec.margin_suggested !== rec.margin_current && (
                                                                <>
                                                                    <ArrowRight size={10} className="inline mx-1 text-slate-300" />
                                                                    <span className="font-bold text-emerald-600">{Number(rec.margin_suggested).toFixed(1)}%</span>
                                                                </>
                                                            )}
                                                        </div>
                                                    )}
                                                    {rec.savings_per_unit > 0 && (
                                                        <div className="bg-emerald-50 rounded-lg px-2.5 py-1.5">
                                                            <span className="text-emerald-600 font-bold">Ahorro: {formatCLP(rec.savings_per_unit)}/ud</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 pt-1">
                                                    <button
                                                        onClick={() => handleResolve(rec.id, 'ACCEPTED')}
                                                        disabled={resolvingId === rec.id}
                                                        className="flex min-h-11 items-center gap-1.5 px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        {resolvingId === rec.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                                        Aplicar
                                                    </button>
                                                    <button
                                                        onClick={() => handleResolve(rec.id, 'REJECTED')}
                                                        disabled={resolvingId === rec.id}
                                                        className="flex min-h-11 items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold rounded-lg transition-colors disabled:opacity-50"
                                                    >
                                                        <XCircle size={14} /> Descartar
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Resolved recommendations */}
                        {resolvedRecs.length > 0 && (
                            <div className="mt-6">
                                <h3 className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                                    <Calendar size={14} /> Historial de Decisiones ({resolvedRecs.length})
                                </h3>
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                    <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                                        {resolvedRecs.map(rec => (
                                            <div key={rec.id} className="px-4 py-2.5 flex items-center gap-3">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                    rec.status === 'ACCEPTED' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                    {rec.status === 'ACCEPTED' ? '✓ Aplicado' : '✗ Descartado'}
                                                </span>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{rec.product_name}</p>
                                                    <p className="text-[10px] text-slate-400">{rec.recommendation_type}</p>
                                                </div>
                                                <span className="text-[10px] text-slate-400">{rec.resolved_at ? formatDate(rec.resolved_at) : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ========== SUPPLIER COMPARISON TAB ========== */}
                {activeTab === 'suppliers' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Building2 size={18} className="text-teal-500" />
                                Comparativa de Precios por Proveedor
                            </h2>
                            <div className="flex gap-2">
                                <button
                                    disabled={exporting || supplierOverview.length === 0}
                                    aria-label="Descargar Proveedores en Excel"
                                    aria-busy={exporting}
                                    onClick={async () => {
                                        setExporting(true);
                                        try {
                                            await exportSuppliersExcel(supplierOverview);
                                            toast.success('✅ Excel descargado');
                                        } catch { toast.error('Error al exportar'); }
                                        finally { setExporting(false); }
                                    }}
                                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                >
                                    {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                                    Excel
                                </button>
                                <button
                                    disabled={exporting || supplierOverview.length === 0}
                                    aria-label="Descargar Proveedores en PDF"
                                    aria-busy={exporting}
                                    onClick={async () => {
                                        setExporting(true);
                                        try {
                                            printSuppliersPDF(supplierOverview);
                                            toast.success('📄 PDF generado');
                                        } catch {
                                            toast.error('Error al generar PDF');
                                        } finally {
                                            setExporting(false);
                                        }
                                    }}
                                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-50"
                                >
                                    {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Printer size={13} aria-hidden="true" />} PDF
                                </button>
                            </div>
                        </div>

                        {supplierOverview.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <Building2 size={48} className="mx-auto mb-3 text-slate-300" />
                                <p className="text-slate-600 font-semibold">Sin datos de comparación</p>
                                <p className="text-sm text-slate-400 mt-1">Los precios se registran automáticamente al recibir órdenes de compra</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="p-3 text-left text-[10px] font-bold text-slate-500 uppercase">Producto</th>
                                                <th className="p-3 text-right text-[10px] font-bold text-slate-500 uppercase">Costo Actual</th>
                                                <th className="p-3 text-right text-[10px] font-bold text-emerald-600 uppercase">Más Barato</th>
                                                <th className="p-3 text-left text-[10px] font-bold text-emerald-600 uppercase">Proveedor</th>
                                                <th className="p-3 text-right text-[10px] font-bold text-red-500 uppercase">Más Caro</th>
                                                <th className="p-3 text-left text-[10px] font-bold text-red-500 uppercase">Proveedor</th>
                                                <th className="p-3 text-right text-[10px] font-bold text-slate-500 uppercase">Spread</th>
                                                <th className="p-3 text-center text-[10px] font-bold text-slate-500 uppercase"># Prov.</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {supplierOverview.map((row: any, i: number) => (
                                                <tr key={row.product_id || i} className="hover:bg-slate-50/50 transition-colors">
                                                    <td className="p-3">
                                                        <p className="text-sm font-semibold text-slate-800 truncate max-w-xs">{row.product_name}</p>
                                                        <p className="text-[10px] text-slate-400">{row.sku}</p>
                                                    </td>
                                                    <td className="p-3 text-right text-sm font-bold text-slate-700">{formatCLP(Number(row.current_cost))}</td>
                                                    <td className="p-3 text-right text-sm font-bold text-emerald-600">{formatCLP(Number(row.cheapest_cost))}</td>
                                                    <td className="p-3 text-left text-xs text-emerald-600 truncate max-w-[120px]">{row.cheapest_supplier}</td>
                                                    <td className="p-3 text-right text-sm font-bold text-red-500">{formatCLP(Number(row.most_expensive_cost))}</td>
                                                    <td className="p-3 text-left text-xs text-red-500 truncate max-w-[120px]">{row.most_expensive_supplier}</td>
                                                    <td className="p-3 text-right">
                                                        <span className="text-xs font-bold text-amber-600">{formatCLP(Number(row.price_spread))}</span>
                                                    </td>
                                                    <td className="p-3 text-center text-sm font-bold text-slate-500">{row.supplier_count}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ========== HISTORY TAB ========== */}
                {activeTab === 'history' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between flex-wrap gap-2">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Calendar size={18} className="text-slate-500" />
                                Historial Completo ({history.length})
                            </h2>
                            <div className="flex flex-wrap gap-1.5">
                                {PERIODS.map(p => (
                                    <button
                                        type="button"
                                        key={p.value}
                                        onClick={() => setPeriod(p.value)}
                                        className={`min-h-11 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                                            period === p.value
                                                ? 'bg-sky-500 text-white'
                                                : 'bg-white text-slate-500 border border-slate-200'
                                        }`}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <div className="flex gap-2">
                                <button
                                    disabled={exporting || history.length === 0}
                                    aria-label="Descargar Historial en Excel"
                                    aria-busy={exporting}
                                    onClick={async () => {
                                        setExporting(true);
                                        try {
                                            const pl = PERIODS.find(p => p.value === period)?.label || period;
                                            await exportHistoryExcel(history, pl);
                                            toast.success('✅ Excel descargado');
                                        } catch { toast.error('Error al exportar'); }
                                        finally { setExporting(false); }
                                    }}
                                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50"
                                >
                                    {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                                    Excel
                                </button>
                                <button
                                    disabled={exporting || history.length === 0}
                                    aria-label="Descargar Historial en PDF"
                                    aria-busy={exporting}
                                    onClick={async () => {
                                        setExporting(true);
                                        try {
                                            const pl = PERIODS.find(p => p.value === period)?.label || period;
                                            printHistoryPDF(history, pl);
                                            toast.success('📄 PDF generado');
                                        } catch {
                                            toast.error('Error al generar PDF');
                                        } finally {
                                            setExporting(false);
                                        }
                                    }}
                                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-sky-700 bg-sky-50 border border-sky-200 rounded-lg hover:bg-sky-100 transition-colors disabled:opacity-50"
                                >
                                    {exporting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Printer size={13} aria-hidden="true" />} PDF
                                </button>
                            </div>
                        </div>

                        {history.length === 0 ? (
                            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                                <Package size={48} className="mx-auto mb-3 text-slate-300" />
                                <p className="text-slate-600 font-semibold">Sin cambios registrados</p>
                                <p className="text-sm text-slate-400 mt-1">Los cambios se registran al recibir órdenes de compra</p>
                            </div>
                        ) : (
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full">
                                        <thead className="bg-slate-50">
                                            <tr>
                                                <th className="p-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Fecha</th>
                                                <th className="p-2.5 text-left text-[10px] font-bold text-slate-500 uppercase">Producto</th>
                                                <th className="p-2.5 text-center text-[10px] font-bold text-slate-500 uppercase">Tipo</th>
                                                <th className="p-2.5 text-right text-[10px] font-bold text-slate-500 uppercase">Anterior</th>
                                                <th className="p-2.5 text-right text-[10px] font-bold text-slate-500 uppercase">Nuevo</th>
                                                <th className="p-2.5 text-center text-[10px] font-bold text-slate-500 uppercase">Δ%</th>
                                                <th className="p-2.5 text-center text-[10px] font-bold text-slate-500 uppercase">Fuente</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {history.map((entry, i) => {
                                                const isUp = entry.new_value > entry.old_value;
                                                const isLeveling = entry.change_type === 'PRICE_LEVELING';
                                                const isGenerated = entry.change_type === 'COST_GENERATED';
                                                return (
                                                    <tr key={entry.id || i} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="p-2.5 text-[10px] text-slate-500 whitespace-nowrap">{formatDate(entry.created_at)}</td>
                                                        <td className="p-2.5">
                                                            <p className="text-sm font-semibold text-slate-800 truncate max-w-xs">{entry.product_name}</p>
                                                            <p className="text-[10px] text-slate-400">{entry.sku}</p>
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                                                isLeveling ? 'bg-purple-100 text-purple-700' :
                                                                isGenerated ? 'bg-sky-100 text-sky-700' :
                                                                isUp ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                                                            }`}>
                                                                {isLeveling ? 'Nivelar' : isGenerated ? 'Auto' : isUp ? 'Subida' : 'Bajada'}
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-right text-sm text-slate-500">{formatCLP(entry.old_value)}</td>
                                                        <td className="p-2.5 text-right text-sm font-bold text-slate-800">{formatCLP(entry.new_value)}</td>
                                                        <td className="p-2.5 text-center">
                                                            <span className={`text-xs font-bold ${isUp ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                {Number(entry.change_percent) > 0 ? '+' : ''}{Number(entry.change_percent).toFixed(1)}%
                                                            </span>
                                                        </td>
                                                        <td className="p-2.5 text-center">
                                                            <span className="text-[9px] font-semibold text-slate-400 uppercase">
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
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
