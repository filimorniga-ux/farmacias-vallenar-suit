'use client';

/**
 * WebPriceResearchPanel — Panel de investigación de precios de mercado
 * 
 * Solo visible en desktop. Busca precios en internet producto por producto
 * y permite aplicar actualizaciones selectivas al inventario.
 * 
 * Diseñado para ejecución nocturna: pausable, con progreso persistido.
 */

import React, { useState, useRef, useCallback } from 'react';
import { Globe, Play, Pause, CheckCircle2, XCircle, Search, AlertTriangle, TrendingUp, TrendingDown, Minus, Lock, Loader2, Clock, ExternalLink, BarChart3, Zap, ShieldCheck, Info } from 'lucide-react';
import { toast } from 'sonner';
import { startPriceResearchSecure, researchSingleProductSecure, applyResearchPricesSecure } from '@/actions/price-research';
import type { ProductResearchResult } from '@/lib/web-price-search';

interface WebPriceResearchPanelProps {
    onClose: () => void;
}

type ResearchStatus = 'IDLE' | 'PREPARING' | 'RUNNING' | 'PAUSED' | 'DONE';

export default function WebPriceResearchPanel({ onClose }: WebPriceResearchPanelProps) {
    // Auth
    const [pin, setPin] = useState('');
    const [pinVerified, setPinVerified] = useState(false);

    // Search config
    const [limit, setLimit] = useState(50);

    // Research state
    const [status, setStatus] = useState<ResearchStatus>('IDLE');
    const [sessionId, setSessionId] = useState('');
    const [products, setProducts] = useState<Array<{ name: string; sku: string; currentPrice: number; costPrice: number }>>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [currentProduct, setCurrentProduct] = useState('');
    const [results, setResults] = useState<ProductResearchResult[]>([]);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [isApplying, setIsApplying] = useState(false);
    const [startTime, setStartTime] = useState(0);

    const pauseRef = useRef(false);
    const abortRef = useRef(false);

    // ========================================================================
    // START RESEARCH
    // ========================================================================

    // Detect Electron environment (two-stage check)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const electronAPI = typeof window !== 'undefined' && 'electronAPI' in window ? (window as any).electronAPI : null;
    const isElectronEnv = !!electronAPI?.isElectron;
    const hasElectronSearch = !!electronAPI?.webPriceSearch;

    /**
     * Fallback: server-side search (degraded — DuckDuckGo blocks server fetch).
     * Kept as legacy; will only work if DuckDuckGo re-enables server scraping.
     */
    const runResearchServerFallback = useCallback(async (productList: typeof products, sid: string) => {
        for (let i = 0; i < productList.length; i++) {
            if (abortRef.current) break;

            while (pauseRef.current && !abortRef.current) {
                await new Promise(r => setTimeout(r, 500));
            }
            if (abortRef.current) break;

            const product = productList[i];
            setCurrentIndex(i);
            setCurrentProduct(product.name);

            const res = await researchSingleProductSecure(
                product.name,
                product.sku,
                product.currentPrice,
                product.costPrice,
                sid,
                pin
            );

            if (res.success && res.result) {
                setResults(prev => [...prev, res.result!]);

                if (res.result.smartPrice && !res.result.smartPrice.marginProtectionApplied) {
                    const diff = Math.abs(res.result.smartPrice.recommendedPrice - res.result.currentPrice);
                    if (diff > res.result.currentPrice * 0.02) {
                        setSelectedSkus(prev => new Set([...prev, res.result!.sku]));
                    }
                }
            }

            if (i < productList.length - 1 && !abortRef.current) {
                await new Promise(r => setTimeout(r, 2500));
            }
        }

        if (!abortRef.current) {
            setStatus('DONE');
            toast.success('Investigación completada');
        }
    }, [pin]);

    /**
     * Electron path: uses hidden BrowserWindow (real Chromium) via IPC.
     * This avoids DuckDuckGo CAPTCHA/anomaly blocks. $0 costo.
     */
    const startElectronBatchSearch = useCallback((productList: typeof products) => {
        const api = electronAPI.webPriceSearch;

        // Register event listeners
        api.onProgress((data: { current: number; total: number; productName: string; sku: string }) => {
            setCurrentIndex(data.current - 1);
            setCurrentProduct(data.productName);
        });

        api.onResult((data: { current: number; total: number; sku: string; result: ProductResearchResult | null }) => {
            setCurrentIndex(data.current);
            if (data.result) {
                // Add sku to result for apply logic
                const resultWithSku = { ...data.result, sku: data.sku };
                setResults(prev => [...prev, resultWithSku]);

                // Auto-select significant recommendations
                if (data.result.smartPrice && !data.result.smartPrice.marginProtectionApplied) {
                    const diff = Math.abs(data.result.smartPrice.recommendedPrice - data.result.currentPrice);
                    if (diff > data.result.currentPrice * 0.02) {
                        setSelectedSkus(prev => new Set([...prev, data.sku]));
                    }
                }
            }
        });

        api.onComplete(() => {
            setStatus('DONE');
            toast.success('Investigación completada');
            api.removeAllListeners();
        });

        api.onError((data: { error: string }) => {
            toast.error(`Error: ${data.error}`);
            setStatus('DONE');
            api.removeAllListeners();
        });

        // Start batch (non-blocking — results come via events)
        api.startBatch(productList);
    }, [electronAPI]);

    const handleStart = useCallback(async () => {
        if (!pin || pin.length < 4) {
            toast.error('Ingresa tu PIN de seguridad');
            return;
        }

        // Check if Electron with new API — prompt restart if old version
        if (isElectronEnv && !hasElectronSearch) {
            toast.error('🔄 Actualización necesaria: cierra y vuelve a abrir la app de escritorio para activar la búsqueda de precios mejorada.');
            return;
        }

        setStatus('PREPARING');

        const res = await startPriceResearchSecure({ pin, limit });
        if (!res.success || !res.session) {
            toast.error(res.error || 'Error al preparar');
            setStatus('IDLE');
            return;
        }

        setPinVerified(true);
        setSessionId(res.session.sessionId);
        setProducts(res.session.products);
        setResults([]);
        setCurrentIndex(0);
        setSelectedSkus(new Set());
        pauseRef.current = false;
        abortRef.current = false;
        setStartTime(Date.now());

        toast.success(`Investigación iniciada: ${res.session.products.length} productos`);
        setStatus('RUNNING');

        if (hasElectronSearch) {
            startElectronBatchSearch(res.session.products);
        } else {
            await runResearchServerFallback(res.session.products, res.session.sessionId);
        }
    }, [pin, limit, hasElectronSearch, startElectronBatchSearch, runResearchServerFallback]);

    // ========================================================================
    // PAUSE / RESUME / STOP
    // ========================================================================

    const handlePause = () => {
        if (hasElectronSearch) {
            electronAPI.webPriceSearch.pauseBatch();
        }
        pauseRef.current = true;
        setStatus('PAUSED');
    };

    const handleResume = () => {
        if (hasElectronSearch) {
            electronAPI.webPriceSearch.pauseBatch(); // toggle
        }
        pauseRef.current = false;
        setStatus('RUNNING');
    };

    const handleStop = () => {
        if (hasElectronSearch) {
            electronAPI.webPriceSearch.stopBatch();
            electronAPI.webPriceSearch.removeAllListeners();
        }
        abortRef.current = true;
        pauseRef.current = false;
        setStatus('DONE');
    };

    // ========================================================================
    // APPLY SELECTED PRICES
    // ========================================================================

    const handleApply = async () => {
        if (selectedSkus.size === 0) {
            toast.error('Selecciona al menos un producto');
            return;
        }

        const items = results
            .filter(r => selectedSkus.has(r.sku) && r.smartPrice)
            .map(r => ({ sku: r.sku, newPrice: r.smartPrice!.recommendedPrice }));

        if (items.length === 0) return;

        if (!confirm(`¿Aplicar precio inteligente a ${items.length} productos?\n\nReglas aplicadas:\n• Outliers filtrados (ofertas flash)\n• Mediana del mercado como referencia\n• Descuento competitivo del 3%\n• Precio protegido: nunca bajo el costo + 15% margen\n• Redondeado a $50 CLP`)) return;

        setIsApplying(true);
        const res = await applyResearchPricesSecure({ pin, sessionId, items });
        setIsApplying(false);

        if (res.success) {
            toast.success(`${res.applied} precios actualizados correctamente`);
            setSelectedSkus(new Set());
        } else {
            toast.error(res.error || 'Error al aplicar precios');
        }
    };

    // ========================================================================
    // HELPERS
    // ========================================================================

    const formatPrice = (price: number) => {
        if (!price || price === 0) return '-';
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(price);
    };

    const progressPercent = products.length > 0 ? Math.round((currentIndex / products.length) * 100) : 0;
    const elapsedSec = startTime > 0 ? Math.round((Date.now() - startTime) / 1000) : 0;
    const estimatedTotal = currentIndex > 0 ? Math.round((elapsedSec / currentIndex) * products.length) : 0;
    const remainingSec = estimatedTotal - elapsedSec;

    const resultsWithSmartPrice = results.filter(r => r.smartPrice != null);
    const resultsWithPrices = results.filter(r => r.marketPriceAvg > 0);
    const avgDiff = resultsWithPrices.length > 0
        ? Math.round(resultsWithPrices.reduce((s, r) => s + r.priceDiffPercent, 0) / resultsWithPrices.length * 100) / 100
        : 0;

    const toggleSelect = (sku: string) => {
        setSelectedSkus(prev => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const selectAll = () => {
        const skus = resultsWithSmartPrice.map(r => r.sku);
        setSelectedSkus(new Set(skus));
    };

    const deselectAll = () => setSelectedSkus(new Set());

    // ========================================================================
    // RENDER
    // ========================================================================

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col animate-in zoom-in-95">

                {/* Header */}
                <div className="p-5 bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 text-white flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-white/20 rounded-xl backdrop-blur-sm">
                                <Globe size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">Investigación de Precios de Mercado</h2>
                                <p className="text-sm text-white/70">Busca precios en farmacias online de Chile • Solo Desktop</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-white text-xl leading-none">✕</button>
                    </div>

                    {/* Progress Bar */}
                    {(status === 'RUNNING' || status === 'PAUSED' || status === 'DONE') && (
                        <div className="mt-4">
                            <div className="flex justify-between text-xs text-white/80 mb-1.5">
                                <span>{status === 'DONE' ? '✅ Completado' : status === 'PAUSED' ? '⏸ En Pausa' : `🔍 ${currentProduct.substring(0, 50)}...`}</span>
                                <span>{currentIndex}/{products.length} ({progressPercent}%)</span>
                            </div>
                            <div className="w-full bg-white/20 rounded-full h-2.5">
                                <div
                                    className={`h-2.5 rounded-full transition-all duration-500 ${status === 'PAUSED' ? 'bg-amber-400' : 'bg-emerald-400'}`}
                                    style={{ width: `${status === 'DONE' ? 100 : progressPercent}%` }}
                                />
                            </div>
                            {status === 'RUNNING' && remainingSec > 0 && (
                                <p className="text-xs text-white/60 mt-1 flex items-center gap-1">
                                    <Clock size={10} /> Estimado restante: {Math.floor(remainingSec / 60)}m {remainingSec % 60}s
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {/* Setup Screen */}
                    {status === 'IDLE' && (
                        <div className="p-8 max-w-lg mx-auto space-y-6">
                            <div className="text-center mb-8">
                                <div className="inline-flex p-4 bg-indigo-50 rounded-full mb-4">
                                    <Search size={40} className="text-indigo-600" />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Configurar Investigación</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    El sistema buscará precios en farmacias online chilenas y calculará un <strong>precio competitivo inteligente</strong>:
                                </p>
                                <ul className="text-xs text-slate-500 mt-2 space-y-1 ml-4 list-disc">
                                    <li>Filtra ofertas flash y precios inflados (IQR)</li>
                                    <li>Usa la <strong>mediana</strong> del mercado (no el mínimo ni promedio)</li>
                                    <li>Aplica -3% descuento competitivo</li>
                                    <li>Protege margen: nunca bajo costo + 15%</li>
                                </ul>
                            </div>

                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                                    <div>
                                        <strong>Proceso lento:</strong> ~3 segundos por producto para evitar bloqueos.
                                        <br />50 productos ≈ 2.5 min, 500 productos ≈ 25 min.
                                        <br />Puedes pausar/reanudar en cualquier momento.
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Cantidad de Productos
                                </label>
                                <select
                                    value={limit}
                                    onChange={(e) => setLimit(Number(e.target.value))}
                                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none"
                                >
                                    <option value={10}>10 productos (prueba rápida ~30s)</option>
                                    <option value={50}>50 productos (~2.5 min)</option>
                                    <option value={100}>100 productos (~5 min)</option>
                                    <option value={250}>250 productos (~12 min)</option>
                                    <option value={500}>500 productos (~25 min)</option>
                                    <option value={1000}>1.000 productos (~50 min)</option>
                                    <option value={9999}>Todos los productos</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    <Lock size={14} className="inline mr-1" />
                                    PIN de Seguridad
                                </label>
                                <input
                                    type="password"
                                    maxLength={6}
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="Ingresa tu PIN admin"
                                    className="w-full p-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-center tracking-widest"
                                />
                            </div>

                            <button
                                onClick={handleStart}
                                disabled={!pin || pin.length < 4}
                                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-200 transition-all"
                            >
                                <Zap size={20} />
                                Iniciar Investigación
                            </button>
                        </div>
                    )}

                    {/* Preparing */}
                    {status === 'PREPARING' && (
                        <div className="p-16 text-center">
                            <Loader2 size={48} className="mx-auto text-indigo-600 animate-spin mb-4" />
                            <p className="text-lg font-medium text-slate-600">Preparando lista de productos...</p>
                        </div>
                    )}

                    {/* Results Table */}
                    {(status === 'RUNNING' || status === 'PAUSED' || status === 'DONE') && (
                        <div className="p-4">
                            {/* Stats Summary */}
                            <div className="grid grid-cols-4 gap-3 mb-4">
                                <div className="bg-slate-50 rounded-xl p-3 text-center border">
                                    <p className="text-2xl font-bold text-slate-800">{results.length}</p>
                                    <p className="text-xs text-slate-500">Investigados</p>
                                </div>
                                <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                                    <p className="text-2xl font-bold text-emerald-700">{resultsWithPrices.length}</p>
                                    <p className="text-xs text-emerald-600">Con Precio</p>
                                </div>
                                <div className={`rounded-xl p-3 text-center border ${avgDiff < 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'}`}>
                                    <p className={`text-2xl font-bold ${avgDiff < 0 ? 'text-red-700' : 'text-blue-700'}`}>
                                        {avgDiff > 0 ? '+' : ''}{avgDiff}%
                                    </p>
                                    <p className="text-xs text-slate-500">Δ Promedio</p>
                                </div>
                                <div className="bg-indigo-50 rounded-xl p-3 text-center border border-indigo-100">
                                    <p className="text-2xl font-bold text-indigo-700">{selectedSkus.size}</p>
                                    <p className="text-xs text-indigo-600">Seleccionados</p>
                                </div>
                            </div>

                            {/* Controls */}
                            <div className="flex items-center gap-2 mb-4">
                                {status === 'RUNNING' && (
                                    <>
                                        <button onClick={handlePause} className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg flex items-center gap-2 text-sm">
                                            <Pause size={14} /> Pausar
                                        </button>
                                        <button onClick={handleStop} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg flex items-center gap-2 text-sm">
                                            <XCircle size={14} /> Detener
                                        </button>
                                    </>
                                )}
                                {status === 'PAUSED' && (
                                    <button onClick={handleResume} className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg flex items-center gap-2 text-sm">
                                        <Play size={14} /> Reanudar
                                    </button>
                                )}
                                {status === 'DONE' && resultsWithPrices.length > 0 && (
                                    <>
                                        <button onClick={selectAll} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm">
                                            Seleccionar Todo
                                        </button>
                                        <button onClick={deselectAll} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-lg text-sm">
                                            Deseleccionar
                                        </button>
                                        <div className="flex-1" />
                                        <button
                                            onClick={handleApply}
                                            disabled={selectedSkus.size === 0 || isApplying}
                                            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-200 text-sm transition-all"
                                        >
                                            {isApplying ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                                            Aplicar {selectedSkus.size} Seleccionados
                                        </button>
                                    </>
                                )}
                            </div>

                            {/* Results Table */}
                            {results.length > 0 && (
                                <div className="border border-slate-200 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="bg-slate-50 border-b border-slate-200">
                                            <tr>
                                                <th className="px-3 py-2.5 text-left font-semibold text-slate-600 w-8">✓</th>
                                                <th className="px-3 py-2.5 text-left font-semibold text-slate-600">Producto</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-slate-600">Actual</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Costo</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-blue-700 bg-blue-50/50">Mediana Web</th>
                                                <th className="px-3 py-2.5 text-right font-semibold text-indigo-700 bg-indigo-50/50">🧠 Recomendado</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-slate-600">Δ%</th>
                                                <th className="px-3 py-2.5 text-center font-semibold text-slate-600">Fuentes</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {results.map((r) => {
                                                const hasSmartPrice = r.smartPrice !== null && r.smartPrice !== undefined;
                                                const diff = hasSmartPrice
                                                    ? Math.round(((r.smartPrice!.recommendedPrice - r.currentPrice) / r.currentPrice) * 100)
                                                    : 0;
                                                return (
                                                    <tr
                                                        key={r.sku}
                                                        className={`hover:bg-slate-50 transition-colors ${selectedSkus.has(r.sku) ? 'bg-indigo-50/50' : ''}`}
                                                    >
                                                        <td className="px-3 py-2.5">
                                                            {hasSmartPrice && (
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selectedSkus.has(r.sku)}
                                                                    onChange={() => toggleSelect(r.sku)}
                                                                    className="w-4 h-4 accent-indigo-600 rounded"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5">
                                                            <div className="font-medium text-slate-800 truncate max-w-[280px]" title={r.productName}>
                                                                {r.productName}
                                                            </div>
                                                            <div className="text-xs text-slate-400">{r.sku}</div>
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono font-medium text-slate-700">
                                                            {formatPrice(r.currentPrice)}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">
                                                            {r.costPrice > 0 ? formatPrice(r.costPrice) : <span className="text-slate-200">-</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right font-mono font-medium text-blue-700 bg-blue-50/30">
                                                            {hasSmartPrice ? formatPrice(r.smartPrice!.medianPrice) : <span className="text-slate-300">-</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right bg-indigo-50/30">
                                                            {hasSmartPrice ? (
                                                                <div className="flex items-center justify-end gap-1" title={r.smartPrice!.reasoning}>
                                                                    <span className="font-mono font-bold text-indigo-700">
                                                                        {formatPrice(r.smartPrice!.recommendedPrice)}
                                                                    </span>
                                                                    {r.smartPrice!.marginProtectionApplied && (
                                                                        <span title="Protección de margen activada"><ShieldCheck size={12} className="text-amber-500" /></span>
                                                                    )}
                                                                    {r.smartPrice!.outlierLowPrices.length > 0 && (
                                                                        <span title={`${r.smartPrice!.outlierLowPrices.length} oferta(s) flash descartada(s)`}><Info size={10} className="text-slate-400" /></span>
                                                                    )}
                                                                </div>
                                                            ) : <span className="text-slate-300">-</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            {hasSmartPrice ? (
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${diff > 5 ? 'bg-red-100 text-red-700' : diff < -5 ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                                                                    {diff > 0 ? <TrendingUp size={10} /> : diff < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                                                                    {diff > 0 ? '+' : ''}{diff}%
                                                                </span>
                                                            ) : <span className="text-slate-300">-</span>}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-center">
                                                            {r.webResults.length > 0 ? (
                                                                <div className="flex flex-wrap gap-1 justify-center">
                                                                    {r.webResults.slice(0, 3).map((wr, wi) => (
                                                                        <a
                                                                            key={wi}
                                                                            href={wr.url}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-100 flex items-center gap-0.5"
                                                                            title={`${wr.source}: ${formatPrice(wr.price)}`}
                                                                        >
                                                                            {wr.source.substring(0, 8)}
                                                                            <ExternalLink size={8} />
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            ) : <span className="text-slate-300 text-xs">Sin datos</span>}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {results.length === 0 && status === 'RUNNING' && (
                                <div className="text-center py-12 text-slate-400">
                                    <Loader2 size={32} className="mx-auto animate-spin mb-3" />
                                    <p>Buscando precios...</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
