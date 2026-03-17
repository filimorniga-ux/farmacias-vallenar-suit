/**
 * CostAlertModal — Modal de alertas de cambios de costos post-recepción
 * 
 * Se muestra después de recibir una OC cuando se detectan cambios en costos
 * respecto al costo anterior del producto.
 */
import React from 'react';
import { X, TrendingUp, TrendingDown, Sparkles, AlertTriangle, CheckCircle } from 'lucide-react';

export interface CostAlertItem {
    sku: string;
    productName: string;
    productId: string;
    oldCost: number;
    newCost: number;
    changePercent: number;
    direction: 'UP' | 'DOWN' | 'NEW';
    supplierId?: string;
}

interface CostAlertModalProps {
    isOpen: boolean;
    onClose: () => void;
    alerts: CostAlertItem[];
    orderId?: string;
}

const formatCLP = (value: number) =>
    new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

export const CostAlertModal: React.FC<CostAlertModalProps> = ({
    isOpen,
    onClose,
    alerts,
    orderId,
}) => {
    if (!isOpen || alerts.length === 0) return null;

    const increases = alerts.filter(a => a.direction === 'UP');
    const decreases = alerts.filter(a => a.direction === 'DOWN');
    const newCosts = alerts.filter(a => a.direction === 'NEW');

    return (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200 flex items-center justify-between">
                    <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <AlertTriangle size={18} className="text-amber-500" />
                            Cambios de Costo Detectados
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            {alerts.length} producto{alerts.length > 1 ? 's' : ''} con variación de costo
                            {orderId && ` · OC #${orderId.slice(0, 8)}`}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 hover:bg-white/80 rounded-lg text-slate-400 transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Summary badges */}
                <div className="px-6 py-3 flex gap-3 border-b border-slate-100">
                    {increases.length > 0 && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 text-red-700 rounded-full text-xs font-bold">
                            <TrendingUp size={12} />
                            {increases.length} subieron
                        </span>
                    )}
                    {decreases.length > 0 && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-bold">
                            <TrendingDown size={12} />
                            {decreases.length} bajaron
                        </span>
                    )}
                    {newCosts.length > 0 && (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-700 rounded-full text-xs font-bold">
                            <Sparkles size={12} />
                            {newCosts.length} nuevo{newCosts.length > 1 ? 's' : ''}
                        </span>
                    )}
                </div>

                {/* Alerts list */}
                <div className="overflow-y-auto max-h-[50vh] divide-y divide-slate-100">
                    {alerts.map((alert, idx) => (
                        <div key={`${alert.sku}-${idx}`} className="px-6 py-3 flex items-center gap-4 hover:bg-slate-50/50">
                            {/* Direction icon */}
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                alert.direction === 'UP' ? 'bg-red-100' : 
                                alert.direction === 'DOWN' ? 'bg-emerald-100' : 'bg-sky-100'
                            }`}>
                                {alert.direction === 'UP' && <TrendingUp size={16} className="text-red-600" />}
                                {alert.direction === 'DOWN' && <TrendingDown size={16} className="text-emerald-600" />}
                                {alert.direction === 'NEW' && <Sparkles size={16} className="text-sky-600" />}
                            </div>

                            {/* Product info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold text-slate-800 text-sm truncate">{alert.productName}</p>
                                <p className="text-xs text-slate-500">{alert.sku}</p>
                            </div>

                            {/* Price change */}
                            <div className="text-right shrink-0">
                                <div className="flex items-center gap-2 text-sm">
                                    {alert.direction !== 'NEW' && (
                                        <>
                                            <span className="text-slate-400 line-through">{formatCLP(alert.oldCost)}</span>
                                            <span className="text-slate-300">→</span>
                                        </>
                                    )}
                                    <span className={`font-bold ${
                                        alert.direction === 'UP' ? 'text-red-600' :
                                        alert.direction === 'DOWN' ? 'text-emerald-600' : 'text-sky-600'
                                    }`}>
                                        {formatCLP(alert.newCost)}
                                    </span>
                                </div>
                                {alert.direction !== 'NEW' && (
                                    <span className={`text-xs font-bold ${
                                        alert.direction === 'UP' ? 'text-red-500' : 'text-emerald-500'
                                    }`}>
                                        {alert.changePercent > 0 ? '+' : ''}{alert.changePercent.toFixed(1)}%
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <p className="text-xs text-slate-500">
                        Los costos ya fueron actualizados y registrados en el historial
                    </p>
                    <button
                        onClick={onClose}
                        className="flex items-center gap-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white font-bold rounded-xl shadow-lg shadow-sky-200 transition-all text-sm"
                    >
                        <CheckCircle size={14} />
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CostAlertModal;
