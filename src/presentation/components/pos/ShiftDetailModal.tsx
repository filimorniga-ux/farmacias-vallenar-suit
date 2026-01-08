
import { useState, useEffect } from 'react';
import { X, DollarSign, CreditCard, ArrowRightLeft, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Clock, User, Monitor, RefreshCcw } from 'lucide-react';
import { toast } from 'sonner';
import { getShiftDetails, reopenShift } from '../../../actions/history-v2';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

interface ShiftDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    sessionId: string | null;
}

export const ShiftDetailModal: React.FC<ShiftDetailModalProps> = ({ isOpen, onClose, sessionId }) => {
    const router = useRouter();
    const [data, setData] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isReopening, setIsReopening] = useState(false);

    const handleReopen = async () => {
        if (!confirm('¿Estás seguro de que deseas reabrir este turno? Se restaurará como activo.')) return;

        setIsReopening(true);
        try {
            const res = await reopenShift(sessionId!);
            if (res.success) {
                toast.success('Turno reabierto con éxito');

                // Actualizar sesión local para el POS y redirigir
                if (typeof window !== 'undefined') {
                    localStorage.setItem('pos_session_id', sessionId!);
                    window.location.href = '/pos';
                }
            } else {
                toast.error(res.error || 'Error al reabrir');
            }
        } catch (e) {
            toast.error('Error de conexión');
        } finally {
            setIsReopening(false);
        }
    };

    useEffect(() => {
        if (isOpen && sessionId) {
            loadDetails(sessionId);
        } else {
            setData(null);
        }
    }, [isOpen, sessionId]);

    const loadDetails = async (id: string) => {
        setIsLoading(true);
        try {
            const res = await getShiftDetails(id);
            if (res.success) {
                setData(res.data);
            } else {
                toast.error(res.error || 'Error cargando detalles');
                onClose();
            }
        } catch (e) {
            console.error(e);
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' }).format(amount);
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString('es-CL', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]"
                    >
                        {/* Header */}
                        <div className="bg-slate-900 text-white p-6 shrink-0 flex justify-between items-start">
                            <div>
                                <h2 className="text-xl font-bold flex items-center gap-2">
                                    <Monitor className="text-cyan-400" size={20} />
                                    Detalle de Turno
                                </h2>
                                {isLoading ? (
                                    <div className="h-4 w-32 bg-slate-700 rounded animate-pulse mt-2"></div>
                                ) : (
                                    <div className="mt-1 text-slate-400 text-sm flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-cyan-200">{data?.session?.terminal_name}</span>
                                            <span className="text-slate-600">|</span>
                                            <span className="flex items-center gap-1"><User size={12} /> {data?.session?.user_name}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-xs">
                                            <Clock size={12} />
                                            {data?.session?.opened_at && formatDate(data.session.opened_at)}
                                            {data?.session?.closed_at && ` - ${formatDate(data.session.closed_at)}`}
                                        </div>
                                    </div>
                                )}
                            </div>
                            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors bg-white/10 p-2 rounded-full">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                            {isLoading || !data ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-4">
                                    <div className="w-8 h-8 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                                    <p className="text-slate-400 font-medium animate-pulse">Calculando balance...</p>
                                </div>
                            ) : (
                                <div className="space-y-6">

                                    {/* 1. Status Banner if Error */}
                                    {data.session.status === 'CLOSED_FORCE' && (
                                        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-800">
                                            <AlertTriangle className="shrink-0 mt-0.5" />
                                            <div>
                                                <h3 className="font-bold text-sm">Cierre Forzado</h3>
                                                <p className="text-xs mt-1">{data.session.notes || 'Sin justificación registrada.'}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* 2. Main Balance Cards (Grid) */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                                        {/* A. Cash Flow Calculation */}
                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
                                            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 flex items-center gap-2">
                                                <DollarSign size={14} /> Flujo de Efectivo
                                            </h3>

                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between text-slate-600">
                                                    <span>Fondo Inicial</span>
                                                    <span className="font-mono">{formatCurrency(data.summary.openingAmount)}</span>
                                                </div>
                                                <div className="flex justify-between text-green-600">
                                                    <span>(+) Ventas Efectivo</span>
                                                    <span className="font-mono">{formatCurrency(data.summary.cashSales)}</span>
                                                </div>
                                                <div className="flex justify-between text-blue-600">
                                                    <span>(+) Ingresos / Depósitos</span>
                                                    <span className="font-mono">{formatCurrency(data.summary.deposits)}</span>
                                                </div>
                                                <div className="flex justify-between text-red-500">
                                                    <span>(-) Retiros de Caja</span>
                                                    <span className="font-mono">-{formatCurrency(data.summary.withdrawals)}</span>
                                                </div>
                                                <div className="h-px bg-slate-100 my-2"></div>
                                                <div className="flex justify-between font-bold text-slate-800 text-base">
                                                    <span>= Efectivo Teórico</span>
                                                    <span className="font-mono">{formatCurrency(data.summary.theoreticalCash)}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* B. Closing Validation */}
                                        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                                            <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-2 flex items-center gap-2">
                                                <CheckCircle size={14} /> Validación de Cierre
                                            </h3>

                                            <div className="space-y-4">
                                                <div>
                                                    <span className="text-xs text-slate-400 block">Efectivo Declarado (En Caja)</span>
                                                    <span className="text-2xl font-bold text-slate-800 font-mono block">
                                                        {data.session.closing_amount !== null ? formatCurrency(data.session.closing_amount) : '---'}
                                                    </span>
                                                </div>

                                                <div className={`p-3 rounded-lg flex items-center justify-between ${(data.session.cash_difference || 0) === 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                                    }`}>
                                                    <span className="font-bold text-sm">Diferencia</span>
                                                    <span className="font-mono font-bold text-lg">
                                                        {(data.session.cash_difference || 0) > 0 ? '+' : ''}
                                                        {formatCurrency(data.session.cash_difference || 0)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* 3. Sales Breakdown */}
                                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                        <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider mb-4 flex items-center gap-2">
                                            <TrendingUp size={14} /> Resumen de Ventas
                                        </h3>
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <DollarSign size={16} /> <span className="text-xs font-bold">EFECTIVO</span>
                                                </div>
                                                <div className="font-mono font-bold text-slate-800 text-lg">
                                                    {formatCurrency(data.summary.cashSales)}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <CreditCard size={16} /> <span className="text-xs font-bold">TARJETA</span>
                                                </div>
                                                <div className="font-mono font-bold text-slate-800 text-lg">
                                                    {formatCurrency(data.summary.cardSales)}
                                                </div>
                                            </div>
                                            <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                                                <div className="flex items-center gap-2 text-slate-500 mb-1">
                                                    <ArrowRightLeft size={16} /> <span className="text-xs font-bold">TRANSFER</span>
                                                </div>
                                                <div className="font-mono font-bold text-slate-800 text-lg">
                                                    {formatCurrency(data.summary.transferSales)}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end items-center gap-3">
                                            <span className="text-slate-500 text-sm font-medium">Venta Total del Turno:</span>
                                            <span className="text-xl font-bold text-slate-900 font-mono">
                                                {formatCurrency(data.summary.cashSales + data.summary.cardSales + data.summary.transferSales)}
                                            </span>
                                        </div>
                                    </div>

                                </div>
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 bg-white border-t border-slate-100 flex justify-between items-center">
                            <div>
                                {data && ['CLOSED', 'CLOSED_FORCE', 'CLOSED_AUTO'].includes(data.session?.status) && (
                                    <button
                                        onClick={handleReopen}
                                        disabled={isReopening}
                                        className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 font-bold rounded-xl transition-colors flex items-center gap-2 border border-amber-200"
                                    >
                                        {isReopening ? <div className="animate-spin w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full"></div> : <RefreshCcw size={16} />}
                                        Reabrir Turno
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                            >
                                Cerrar
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
