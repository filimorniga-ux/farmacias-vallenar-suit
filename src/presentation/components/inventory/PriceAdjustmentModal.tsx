import React, { useState, useEffect } from 'react';
import { X, Lock, Percent, CheckCircle, AlertCircle } from 'lucide-react';
import { adjustPrices } from '@/actions/pricing';
import { toast } from 'sonner';

interface PriceAdjustmentModalProps {
    mode: 'SINGLE' | 'ALL';
    sku?: string;
    productName?: string;
    currentPrice?: number;
    onClose: () => void;
}

export default function PriceAdjustmentModal({ mode, sku, productName, currentPrice, onClose }: PriceAdjustmentModalProps) {
    const [activeTab, setActiveTab] = useState<'ADJUST' | 'HISTORY'>('ADJUST');
    const [history, setHistory] = useState<any[]>([]);
    const [percentage, setPercentage] = useState<string>('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Calculate preview (for SINGLE mode)
    const previewPrice = React.useMemo(() => {
        if (mode !== 'SINGLE' || !currentPrice || !percentage) return 0;
        const p = parseFloat(percentage);
        if (isNaN(p)) return currentPrice;
        const factor = 1 + (p / 100);
        // Round up to nearest 50 (CLP Rule)
        // e.g. 8383 -> 8400, 8320 -> 8350
        const val = currentPrice * factor;
        return Math.ceil(val / 50) * 50;
    }, [currentPrice, percentage, mode]);

    useEffect(() => {
        if (activeTab === 'HISTORY') {
            loadHistory();
        }
    }, [activeTab]);

    const loadHistory = async () => {
        const { getRecentAdjustments } = await import('@/actions/price-history');
        const res = await getRecentAdjustments();
        if (res.success && res.data) {
            setHistory(res.data);
        }
    };

    const handleUndo = async (batchId: number) => {
        if (!pin) {
            setError('Ingresa tu PIN para deshacer');
            return;
        }
        if (!confirm('¿Estás seguro de revertir este cambio? Se aplicará el cálculo inverso.')) return;

        setLoading(true);
        const { revertPriceAdjustment } = await import('@/actions/price-history');
        const res = await revertPriceAdjustment(batchId, pin);
        setLoading(false);

        if (res.success) {
            toast.success('Cambios revertidos correctamente');
            loadHistory();
        } else {
            toast.error(res.error || 'Error al revertir');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        console.log('🔄 PriceAdjustmentModal: Submitting...', { percentage, pin, mode });
        setError(null);
        setLoading(true);

        const p = parseFloat(percentage);
        if (isNaN(p) || p === 0) {
            console.error('❌ PriceAdjustmentModal: Invalid percentage');
            setError('Ingresa un porcentaje válido (ej: 10, -5)');
            setLoading(false);
            return;
        }

        if (!pin) {
            setError('Ingresa tu PIN de seguridad');
            setLoading(false);
            return;
        }

        try {
            const res = await adjustPrices({
                mode,
                percentage: p,
                pin,
                sku
            });

            if (res.success) {
                console.log('✅ PriceAdjustmentModal: Success! calling onClose...');
                toast.success('Precios actualizados correctamente');
                // Don't close immediately, offer to see history or just close?
                // For simplicity, just close like before
                onClose();
            } else {
                console.error('❌ PriceAdjustmentModal: Server Error', res.error);
                setError(res.error || 'Error al actualizar');
            }
        } catch (err) {
            console.error('❌ PriceAdjustmentModal: Catch Error', err);
            setError('Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className={`p-6 bg-gradient-to-r ${mode === 'ALL' ? 'from-purple-600 to-indigo-600' : 'from-cyan-600 to-blue-600'} text-white relative flex-shrink-0`}>
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                            <Percent size={24} />
                        </div>
                        <h2 className="text-xl font-bold">
                            {mode === 'ALL' ? 'Ajuste Masivo de Precios' : 'Ajustar Precio'}
                        </h2>
                    </div>
                    <div className="flex gap-4 mt-4 text-sm font-bold">
                        <button
                            onClick={() => setActiveTab('ADJUST')}
                            className={`px-3 py-1 rounded-full transition-all ${activeTab === 'ADJUST' ? 'bg-white text-blue-700 shadow-md' : 'text-blue-100 hover:bg-white/10'}`}
                        >
                            Nuevo Ajuste
                        </button>
                        <button
                            onClick={() => setActiveTab('HISTORY')}
                            className={`px-3 py-1 rounded-full transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white text-blue-700 shadow-md' : 'text-blue-100 hover:bg-white/10'}`}
                        >
                            Historial / Deshacer
                        </button>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'ADJUST' ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="p-4 bg-red-50 text-red-700 rounded-xl flex items-center gap-3 text-sm">
                                    <AlertCircle size={20} className="shrink-0" />
                                    {error}
                                </div>
                            )}

                            {/* Percentage Input */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Porcentaje de Ajuste (%)
                                </label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="any"
                                        autoFocus
                                        value={percentage}
                                        onChange={(e) => setPercentage(e.target.value)}
                                        placeholder="Ej: 15 (Sube 15%) o -10 (Baja 10%)"
                                        className="w-full pl-4 pr-10 py-3 text-lg border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 font-mono"
                                    />
                                    <Percent className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                </div>
                                <p className="text-xs text-slate-500 mt-2 ml-1">
                                    Usa valores negativos para descuentos (ej: -10).
                                </p>
                            </div>

                            {/* Preview (Conditional) */}
                            {mode === 'SINGLE' && currentPrice && percentage && !isNaN(parseFloat(percentage)) && (
                                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase font-bold">Actual</p>
                                        <p className="font-mono text-slate-600">${currentPrice.toLocaleString()}</p>
                                    </div>
                                    <div className="text-slate-300">→</div>
                                    <div className="text-right">
                                        <p className="text-xs text-cyan-600 uppercase font-bold">Nuevo Precio</p>
                                        <p className="font-bold text-lg font-mono text-cyan-700">
                                            ${previewPrice.toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Mass Update Warning (Conditional) */}
                            {mode === 'ALL' && percentage && (
                                <div className="p-4 bg-amber-50 text-amber-800 rounded-xl text-sm border border-amber-100">
                                    <strong>⚠️ Advertencia:</strong> Se modificará el precio de venta de miles de productos instantáneamente.
                                </div>
                            )}

                            {/* PIN Input */}
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    PIN de Seguridad
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        maxLength={6}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        placeholder="Ingresa tu PIN admin"
                                        className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-500 tracking-widest text-center"
                                    />
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={loading || !percentage || !pin}
                                className={`w-full py-3 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all
                                    ${loading
                                        ? 'bg-slate-400 cursor-not-allowed'
                                        : mode === 'ALL' ? 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200' : 'bg-cyan-600 hover:bg-cyan-700 shadow-lg shadow-cyan-200'
                                    }
                                `}
                            >
                                {loading ? (
                                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                ) : (
                                    <>
                                        <CheckCircle size={20} />
                                        Confirmar Ajuste
                                    </>
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50 rounded-xl mb-4 border border-gray-200">
                                <label className="block text-sm font-medium text-slate-700 mb-2">
                                    Ingresa tu PIN para habilitar "Deshacer"
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        maxLength={6}
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        placeholder="PIN de seguridad"
                                        className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center"
                                    />
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                </div>
                            </div>

                            {history.length === 0 ? (
                                <div className="text-center py-8 text-slate-400">
                                    No hay historial de ajustes recientes.
                                </div>
                            ) : (
                                history.map((item) => (
                                    <div key={item.id} className={`p-4 rounded-xl border-l-4 shadow-sm text-sm ${item.reverted_at ? 'bg-gray-50 border-gray-300 opacity-60' : 'bg-white border-blue-500'}`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className={`font-bold ${item.mode === 'ALL' ? 'text-purple-600' : 'text-cyan-600'}`}>
                                                    {item.mode === 'ALL' ? 'MASIVO' : 'INDIVIDUAL'}
                                                </span>
                                                <span className="mx-2 text-slate-300">|</span>
                                                <span className="text-slate-500">{new Date(item.created_at).toLocaleString()}</span>
                                            </div>
                                            <span className="font-mono font-bold bg-slate-100 px-2 py-1 rounded">
                                                {item.percentage > 0 ? '+' : ''}{item.percentage}%
                                            </span>
                                        </div>
                                        <p className="text-slate-600 mb-2">
                                            Afectó a {item.affected_count} productos. {item.sku && `(SKU: ${item.sku})`}
                                            {item.user_name && <span className="text-slate-400"> • por {item.user_name}</span>}
                                        </p>

                                        {item.reverted_at ? (
                                            <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-500 bg-slate-200 px-2 py-1 rounded">
                                                <CheckCircle size={12} /> REVERTIDO
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleUndo(item.id)}
                                                disabled={pin.length < 4 || loading}
                                                className="text-red-500 hover:text-red-700 font-bold text-xs flex items-center gap-1 underline disabled:opacity-50 disabled:no-underline transition-all"
                                                title={pin.length < 4 ? 'Ingresa PIN completo (mín 4 dígitos)' : 'Revertir cambio'}
                                            >
                                                <div className="flex items-center gap-1 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors">
                                                    <span className="transform rotate-180 inline-block">↩</span>
                                                    {pin.length < 4 ? 'INGRESA PIN...' : 'DESHACER CAMBIOS'}
                                                </div>
                                            </button>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
