import React, { useState } from 'react';
import { X, RotateCcw, AlertTriangle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import type { CashMovementView } from '@/actions/cash-management-v2';
import { refundSaleSecure } from '@/actions/sales-v2';
import { Loader2 } from 'lucide-react';

type RefundMethod = 'CASH' | 'DEBIT' | 'CREDIT' | 'TRANSFER';

interface ReturnsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sale: CashMovementView;
    userId: string;
    onRefundComplete?: () => void;
}

const ReturnsModal: React.FC<ReturnsModalProps> = ({ isOpen, onClose, sale, userId, onRefundComplete }) => {
    const [reason, setReason] = useState('');
    const [managerPin, setManagerPin] = useState('');
    const [refundMethod, setRefundMethod] = useState<RefundMethod>('CASH');
    const [step, setStep] = useState<'REASON' | 'AUTH'>('REASON');
    const [isVerifying, setIsVerifying] = useState(false);

    React.useEffect(() => {
        if (!isOpen) return;
        const saleMethod = String(sale.payment_method || '').toUpperCase();
        const defaultMethod: RefundMethod =
            saleMethod === 'DEBIT' || saleMethod === 'CREDIT' || saleMethod === 'TRANSFER'
                ? saleMethod
                : 'CASH';
        setRefundMethod(defaultMethod);
    }, [isOpen, sale.payment_method]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (reason.trim().length < 10) {
            toast.error('Ingrese un motivo válido (mín. 10 caracteres)');
            return;
        }
        setStep('AUTH');
    };

    const handleProcessReturn = async () => {
        if (!managerPin || managerPin.length < 4) {
            toast.error('Ingrese un PIN de 4 dígitos');
            return;
        }

        if (!userId) {
            toast.error('Usuario de sesión no disponible');
            return;
        }

        const rawItems = Array.isArray(sale.items) ? sale.items : [];
        const refundItems = rawItems
            .map((item: Record<string, unknown>) => {
                const saleItemId = String(
                    item.sale_item_id ?? item.saleItemId ?? item.id ?? ''
                ).trim();
                const quantity = Number(item.quantity ?? 0);
                const refundedQuantity = Number(item.refunded_quantity ?? 0);
                const availableToRefund = Math.max(0, quantity - refundedQuantity);
                return { saleItemId, quantity: availableToRefund };
            })
            .filter((item) => item.saleItemId && item.quantity > 0);

        if (refundItems.length === 0) {
            toast.error('No hay ítems disponibles para devolución en esta venta');
            return;
        }

        setIsVerifying(true);
        try {
            const result = await refundSaleSecure({
                saleId: String(sale.id),
                userId,
                supervisorPin: managerPin,
                reason: reason.trim(),
                items: refundItems,
                refundMethod,
            });

            if (!result.success) {
                toast.error(result.error || 'No se pudo procesar la devolución');
                return;
            }

            toast.success('Devolución procesada correctamente');
            onRefundComplete?.();
            onClose();
        } catch (error) {
            toast.error('Error al procesar devolución');
            console.error(error);
        } finally {
            setIsVerifying(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="bg-red-600 p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <RotateCcw className="text-red-200" /> Devolución / Anulación
                    </h2>
                    <button onClick={onClose} className="text-red-200 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6">
                    {/* Sale Summary */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-500">VENTA ORIGINAL</span>
                            <span className="text-xs font-mono text-slate-400">{sale.id}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="font-bold text-slate-800">{Array.isArray(sale.items) ? sale.items.length : 0} Productos</span>
                            <span className="font-bold text-red-600 text-lg">-${Number(sale.total_amount ?? sale.total ?? sale.amount ?? 0).toLocaleString('es-CL')}</span>
                        </div>
                    </div>

                    {step === 'REASON' ? (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Motivo de la Devolución</label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="w-full p-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 outline-none h-32 resize-none"
                                    placeholder="Ej: Producto dañado, error de digitación, cliente insatisfecho..."
                                    autoFocus
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">Medio de devolución</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { value: 'CASH', label: 'Efectivo' },
                                        { value: 'DEBIT', label: 'Débito' },
                                        { value: 'CREDIT', label: 'Crédito' },
                                        { value: 'TRANSFER', label: 'Transferencia' },
                                    ] as Array<{ value: RefundMethod; label: string }>).map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setRefundMethod(option.value)}
                                            className={`py-2 px-3 rounded-lg border text-sm font-bold transition-colors ${
                                                refundMethod === option.value
                                                    ? 'bg-red-50 border-red-300 text-red-700'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                                <p>Esta acción registrará ticket de devolución, restaurará stock y descontará el monto del medio seleccionado.</p>
                            </div>

                            <button
                                onClick={handleNext}
                                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-200"
                            >
                                Continuar
                            </button>
                        </div>
                    ) : (
                        <div className="text-center space-y-6">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-600">
                                <Lock size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Autorización Requerida</h3>
                                <p className="text-sm text-slate-500">Ingrese PIN de Gerente/Admin para confirmar</p>
                            </div>

                            <input
                                type="password"
                                value={managerPin}
                                onChange={(e) => setManagerPin(e.target.value)}
                                className="w-full text-center text-2xl tracking-[0.5em] p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-red-500 outline-none font-mono"
                                placeholder="••••"
                                maxLength={4}
                                autoFocus
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('REASON')}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleProcessReturn}
                                    disabled={isVerifying}
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                                >
                                    {isVerifying ? (
                                        <>
                                            <Loader2 className="animate-spin" size={20} />
                                            Verificando...
                                        </>
                                    ) : (
                                        'Confirmar Devolución'
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReturnsModal;
