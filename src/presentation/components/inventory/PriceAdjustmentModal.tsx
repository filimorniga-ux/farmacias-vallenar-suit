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
        return Math.round(currentPrice * factor);
    }, [currentPrice, percentage, mode]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const p = parseFloat(percentage);
        if (isNaN(p) || p === 0) {
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
                toast.success('Precios actualizados correctamente');
                onClose();
            } else {
                setError(res.error || 'Error al actualizar');
            }
        } catch (err) {
            console.error(err);
            setError('Error inesperado');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className={`p-6 bg-gradient-to-r ${mode === 'ALL' ? 'from-purple-600 to-indigo-600' : 'from-cyan-600 to-blue-600'} text-white relative`}>
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
                    <p className="text-white/80 text-sm">
                        {mode === 'ALL'
                            ? 'Esto actualizará el precio de VENTA de TODOS los productos.'
                            : `Ajustando: ${productName}`}
                    </p>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-6">

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

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !percentage || !pin}
                            className={`flex-1 py-3 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-all
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
                    </div>
                </form>
            </div>
        </div>
    );
}
