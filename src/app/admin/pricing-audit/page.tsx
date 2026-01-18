'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    Moon, Play, Pause, CheckCircle, Clock, AlertTriangle,
    TrendingDown, DollarSign, Package, Loader2, Check, X,
    RefreshCw, Monitor
} from 'lucide-react';
import { toast } from 'sonner';
import {
    initializeMonthlyBatches,
    getProductsForBatch,
    getPendingProposals,
    approveProposals,
    savePriceProposal,
    updateBatchProgress,
    getAuditStats,
    PriceAuditBatch,
    PriceAuditResult
} from '@/actions/price-audit';
import { PrinterService } from '@/infrastructure/services/PrinterService';

const NIGHT_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function PricingAuditPage() {
    const [batches, setBatches] = useState<PriceAuditBatch[]>([]);
    const [proposals, setProposals] = useState<PriceAuditResult[]>([]);
    const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, not_viable: 0, avg_savings_percent: 0 });
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRunning, setIsRunning] = useState(false);
    const [currentBatchId, setCurrentBatchId] = useState<number | null>(null);
    const [progress, setProgress] = useState({ processed: 0, total: 0, currentProduct: '', estimatedTimeRemaining: 0 });

    const isElectron = PrinterService.isElectron();

    // Load batches and proposals
    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [batchRes, proposalRes, statsRes] = await Promise.all([
                initializeMonthlyBatches(),
                getPendingProposals(100, 0),
                getAuditStats()
            ]);

            if (batchRes.success && batchRes.batches) setBatches(batchRes.batches);
            if (proposalRes.success && proposalRes.proposals) setProposals(proposalRes.proposals);
            if (statsRes.success && statsRes.stats) setStats(statsRes.stats);
        } catch (error) {
            console.error('Failed to load data:', error);
            toast.error('Error al cargar datos');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Setup Electron event listeners
    useEffect(() => {
        if (!isElectron || !window.electronAPI) return;

        window.electronAPI.onPriceAuditProgress?.((data: any) => {
            setProgress(data);
        });

        window.electronAPI.onPriceAuditResult?.(async (proposal: any) => {
            await savePriceProposal(proposal);
        });

        window.electronAPI.onPriceAuditComplete?.(async (data: any) => {
            setIsRunning(false);
            setCurrentBatchId(null);
            await updateBatchProgress(data.batchId, data.processed, data.processed, 'COMPLETED');
            toast.success(`¡Noche ${data.batchId} completada! ${data.processed} productos analizados.`);
            loadData();
        });

        window.electronAPI.onPriceAuditError?.((data: any) => {
            setIsRunning(false);
            toast.error(`Error en auditoría: ${data.error}`);
        });
    }, [isElectron, loadData]);

    // Start audit for a batch
    const startBatch = async (batch: PriceAuditBatch) => {
        if (!isElectron) {
            toast.error('La auditoría de precios solo funciona en la versión de escritorio');
            return;
        }

        try {
            // Get products for this batch
            const productsRes = await getProductsForBatch(batch.batch_number, 2000, batch.last_processed_offset);
            if (!productsRes.success || !productsRes.products?.length) {
                toast.error('No hay productos para auditar');
                return;
            }

            // Update status to IN_PROGRESS
            await updateBatchProgress(batch.id, batch.processed_products, batch.last_processed_offset, 'IN_PROGRESS');

            // Start audit via IPC
            const result = await window.electronAPI?.startPriceAudit?.({
                batchId: batch.id,
                products: productsRes.products,
                startOffset: batch.last_processed_offset
            });

            if (result?.success) {
                setIsRunning(true);
                setCurrentBatchId(batch.id);
                toast.success(`Iniciando Noche ${batch.batch_number}...`);
            } else {
                toast.error(result?.error || 'Error al iniciar auditoría');
            }
        } catch (error) {
            console.error('Start batch error:', error);
            toast.error('Error al iniciar lote');
        }
    };

    // Pause audit
    const pauseAudit = async () => {
        if (!isElectron) return;
        const result = await window.electronAPI?.pausePriceAudit?.();
        if (result?.paused) {
            setIsRunning(false);
            if (currentBatchId) {
                await updateBatchProgress(currentBatchId, progress.processed, result.lastOffset, 'PAUSED');
            }
            toast.info('Auditoría pausada. Puedes reanudar mañana.');
            loadData();
        }
    };

    // Approve all pending
    const approveAll = async () => {
        const ids = proposals.filter(p => p.suggested_price && p.suggested_price < p.current_price).map(p => p.id);
        if (!ids.length) {
            toast.info('No hay propuestas de reducción de precio');
            return;
        }

        const result = await approveProposals(ids);
        if (result.success) {
            toast.success(`${result.updated} precios actualizados`);
            loadData();
        } else {
            toast.error(result.error || 'Error al aprobar');
        }
    };

    // Approve selected
    const approveSelected = async () => {
        if (!selectedIds.length) {
            toast.info('Selecciona propuestas primero');
            return;
        }
        const result = await approveProposals(selectedIds);
        if (result.success) {
            toast.success(`${result.updated} precios actualizados`);
            setSelectedIds([]);
            loadData();
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const selectAll = () => {
        if (selectedIds.length === proposals.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(proposals.map(p => p.id));
        }
    };

    const formatCLP = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;
    const formatTime = (minutes: number) => {
        const hrs = Math.floor(minutes / 60);
        const mins = Math.floor(minutes % 60);
        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="animate-spin text-cyan-600" size={48} />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="bg-gradient-to-br from-purple-500 to-indigo-600 p-3 rounded-xl text-white">
                            <TrendingDown size={28} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">Auditoría de Precios</h1>
                            <p className="text-sm text-slate-500">Motor de represiado masivo con IA</p>
                        </div>
                    </div>
                    <button onClick={loadData} className="p-2 text-slate-500 hover:bg-slate-100 rounded-lg">
                        <RefreshCw size={20} />
                    </button>
                </div>

                {/* Electron Warning */}
                {!isElectron && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                        <Monitor className="text-amber-600" size={24} />
                        <div>
                            <p className="font-bold text-amber-800">Modo Web Detectado</p>
                            <p className="text-sm text-amber-700">La auditoría nocturna solo funciona en la app de escritorio. Descarga la versión para Mac/Windows.</p>
                        </div>
                    </div>
                )}

                {/* Stats Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase">Pendientes</p>
                        <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase">Aprobados</p>
                        <p className="text-2xl font-bold text-emerald-600">{stats.approved}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase">No Viables</p>
                        <p className="text-2xl font-bold text-slate-400">{stats.not_viable}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                        <p className="text-xs font-bold text-slate-500 uppercase">Ahorro Promedio</p>
                        <p className="text-2xl font-bold text-purple-600">{stats.avg_savings_percent.toFixed(1)}%</p>
                    </div>
                </div>

                {/* Night Batches */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Moon className="text-indigo-500" size={18} />
                            Semana de Auditoría
                        </h2>
                    </div>
                    <div className="p-4 grid grid-cols-7 gap-3">
                        {batches.map((batch, i) => (
                            <div
                                key={batch.id}
                                className={`relative border-2 rounded-xl p-3 text-center transition-all ${batch.status === 'COMPLETED'
                                        ? 'border-emerald-300 bg-emerald-50'
                                        : batch.status === 'IN_PROGRESS'
                                            ? 'border-cyan-300 bg-cyan-50 animate-pulse'
                                            : batch.status === 'PAUSED'
                                                ? 'border-amber-300 bg-amber-50'
                                                : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                            >
                                <p className="text-xs font-bold text-slate-500">Noche {batch.batch_number}</p>
                                <p className="text-sm font-medium text-slate-700">{NIGHT_LABELS[i]}</p>

                                {batch.status === 'COMPLETED' && (
                                    <CheckCircle className="mx-auto mt-2 text-emerald-500" size={24} />
                                )}
                                {batch.status === 'IN_PROGRESS' && (
                                    <Loader2 className="mx-auto mt-2 text-cyan-500 animate-spin" size={24} />
                                )}
                                {batch.status === 'PAUSED' && (
                                    <Pause className="mx-auto mt-2 text-amber-500" size={24} />
                                )}
                                {batch.status === 'PENDING' && (
                                    <Clock className="mx-auto mt-2 text-slate-300" size={24} />
                                )}

                                <p className="text-xs text-slate-500 mt-1">
                                    {batch.processed_products}/{batch.total_products}
                                </p>

                                {isElectron && batch.status !== 'COMPLETED' && !isRunning && (
                                    <button
                                        onClick={() => startBatch(batch)}
                                        className="mt-2 w-full py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 transition flex items-center justify-center gap-1"
                                    >
                                        <Play size={12} />
                                        {batch.status === 'PAUSED' ? 'Reanudar' : 'Iniciar'}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Progress Bar */}
                    {isRunning && (
                        <div className="p-4 bg-cyan-50 border-t border-cyan-100">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-bold text-cyan-800">
                                    Analizando: {progress.currentProduct?.substring(0, 40)}...
                                </span>
                                <button onClick={pauseAudit} className="text-amber-600 hover:text-amber-800">
                                    <Pause size={20} />
                                </button>
                            </div>
                            <div className="w-full bg-cyan-100 rounded-full h-3">
                                <div
                                    className="bg-gradient-to-r from-cyan-500 to-indigo-500 h-3 rounded-full transition-all"
                                    style={{ width: `${progress.total > 0 ? (progress.processed / progress.total * 100) : 0}%` }}
                                />
                            </div>
                            <p className="text-xs text-cyan-600 mt-1">
                                {progress.processed} de {progress.total} • Faltan ~{formatTime(progress.estimatedTimeRemaining)}
                            </p>
                        </div>
                    )}
                </div>

                {/* Proposals Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <DollarSign className="text-emerald-500" size={18} />
                            Propuestas Pendientes ({stats.pending})
                        </h2>
                        <div className="flex gap-2">
                            <button
                                onClick={approveSelected}
                                disabled={!selectedIds.length}
                                className="px-4 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                Aprobar Selección ({selectedIds.length})
                            </button>
                            <button
                                onClick={approveAll}
                                disabled={!proposals.length}
                                className="px-4 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                Aprobar Todo
                            </button>
                        </div>
                    </div>

                    {proposals.length === 0 ? (
                        <div className="p-12 text-center text-slate-400">
                            <Package size={48} className="mx-auto mb-3 opacity-50" />
                            <p>No hay propuestas pendientes</p>
                            <p className="text-sm">Ejecuta una auditoría nocturna para generar propuestas</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="p-3 text-left">
                                            <input
                                                type="checkbox"
                                                checked={selectedIds.length === proposals.length && proposals.length > 0}
                                                onChange={selectAll}
                                                className="rounded border-slate-300"
                                            />
                                        </th>
                                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">SKU</th>
                                        <th className="p-3 text-left text-xs font-bold text-slate-500 uppercase">Producto</th>
                                        <th className="p-3 text-right text-xs font-bold text-slate-500 uppercase">Actual</th>
                                        <th className="p-3 text-right text-xs font-bold text-slate-500 uppercase">Sugerido</th>
                                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">Δ%</th>
                                        <th className="p-3 text-center text-xs font-bold text-slate-500 uppercase">Fuentes</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {proposals.map(p => {
                                        const diff = p.suggested_price ? ((p.current_price - p.suggested_price) / p.current_price * 100) : 0;
                                        return (
                                            <tr key={p.id} className="hover:bg-slate-50 transition">
                                                <td className="p-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedIds.includes(p.id)}
                                                        onChange={() => toggleSelect(p.id)}
                                                        className="rounded border-slate-300"
                                                    />
                                                </td>
                                                <td className="p-3 font-mono text-sm text-slate-600">{p.sku}</td>
                                                <td className="p-3 text-sm text-slate-800 max-w-xs truncate">{p.product_name}</td>
                                                <td className="p-3 text-right font-bold text-slate-700">{formatCLP(p.current_price)}</td>
                                                <td className="p-3 text-right font-bold text-emerald-600">
                                                    {p.suggested_price ? formatCLP(p.suggested_price) : '-'}
                                                </td>
                                                <td className="p-3 text-center">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${diff > 10 ? 'bg-emerald-100 text-emerald-700' :
                                                            diff > 0 ? 'bg-cyan-100 text-cyan-700' :
                                                                'bg-slate-100 text-slate-500'
                                                        }`}>
                                                        {diff > 0 ? `-${diff.toFixed(1)}%` : '0%'}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-center text-sm text-slate-500">{p.sources_found}</td>
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
