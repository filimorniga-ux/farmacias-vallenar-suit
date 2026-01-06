/**
 * PaymentModal Component
 * 
 * Modular payment modal for POS checkout
 * Features: payment method selection, loyalty points, totals display
 * 
 * @version 1.0.0
 */

'use client';

import React from 'react';
import { X, Banknote, CreditCard, Smartphone, AlertTriangle, Star, Printer, DollarSign } from 'lucide-react';
import { Customer } from '../../../../domain/types';
import { usePharmaStore } from '../../../store/useStore';
import { PaymentMethod, useCheckout } from '../../../hooks/useCheckout';

interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export function PaymentModal({ isOpen, onClose, onSuccess }: PaymentModalProps) {
    const { currentCustomer, loyaltyConfig, calculateDiscountValue, currentTicket, currentTerminalId, completeAndNextTicket } = usePharmaStore();

    const {
        isProcessing,
        paymentMethod,
        transferId,
        pointsToRedeem,
        autoPrint,
        cartTotal,
        pointsDiscount,
        finalTotal,
        setPaymentMethod,
        setTransferId,
        setPointsToRedeem,
        setAutoPrint,
        checkout
    } = useCheckout({
        onSuccess: async () => {
            // CHECK CONDITIONS
            if (!currentTicket) {
                console.warn('⚠️ [PaymentModal] Auto-next skipped: No current ticket');
            }
            if (!currentTerminalId) {
                console.warn('⚠️ [PaymentModal] Auto-next skipped: No terminal ID');
            }

            // AUTO-NEXT TICKET: Fire and forget to keep UI snappy
            if (currentTicket && currentTerminalId) {
                import('sonner').then(({ toast }) => toast.info('🔄 Finalizando ticket actual...'));

                // Force await to ensure it runs
                try {
                    const res = await completeAndNextTicket(currentTerminalId, currentTicket.id);
                    if (res.completedTicket) {
                        import('sonner').then(({ toast }) => toast.success('Ticket finalizado correctamente'));
                    }

                    if (res.nextTicket) {
                        import('sonner').then(({ toast }) => toast.success(`🔔 Siguiente: ${res.nextTicket?.number}`));
                    } else {
                        import('sonner').then(({ toast }) => toast.info('No hay más tickets en espera'));
                    }
                } catch (err: any) {
                    console.error('❌ [PaymentModal] Auto-next error:', err);
                    import('sonner').then(({ toast }) => toast.error('Error al avanzar turno: ' + err.message));
                }
            }
            onClose();
            onSuccess?.();
        }
    });

    if (!isOpen) return null;

    const handleCheckout = async () => {
        await checkout();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800">Finalizar Venta</h3>
                    <button
                        onClick={onClose}
                        disabled={isProcessing}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="Cerrar"
                    >
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6">
                    {/* Payment Methods */}
                    <PaymentMethodSelector
                        selected={paymentMethod}
                        onChange={setPaymentMethod}
                        disabled={isProcessing}
                    />

                    {/* Transfer ID Input */}
                    {paymentMethod === 'TRANSFER' && (
                        <TransferIdInput
                            value={transferId}
                            onChange={setTransferId}
                            disabled={isProcessing}
                        />
                    )}

                    {/* Loyalty Points */}
                    {currentCustomer && currentCustomer.totalPoints > 0 && (
                        <LoyaltyPointsSection
                            customer={currentCustomer}
                            loyaltyConfig={loyaltyConfig}
                            pointsToRedeem={pointsToRedeem}
                            onPointsChange={setPointsToRedeem}
                            calculateDiscountValue={calculateDiscountValue}
                            disabled={isProcessing}
                        />
                    )}

                    {/* Totals */}
                    <TotalsDisplay
                        cartTotal={cartTotal}
                        pointsToRedeem={pointsToRedeem}
                        pointsDiscount={pointsDiscount}
                        finalTotal={finalTotal}
                    />

                    {/* Auto-Print Toggle */}
                    <div className="flex items-center justify-between mb-4 px-2 bg-slate-100 p-3 rounded-xl border border-slate-200">
                        <label className="flex items-center gap-3 text-sm font-bold text-slate-700 cursor-pointer select-none w-full">
                            <input
                                type="checkbox"
                                checked={autoPrint}
                                onChange={(e) => setAutoPrint(e.target.checked)}
                                disabled={isProcessing}
                                className="w-5 h-5 rounded text-cyan-600 focus:ring-cyan-500 border-gray-300"
                            />
                            <div className="flex items-center gap-2">
                                <Printer size={18} className="text-slate-500" />
                                <span>Imprimir Ticket Automáticamente</span>
                            </div>
                        </label>
                    </div>

                    {/* Checkout Button */}
                    <button
                        onClick={handleCheckout}
                        disabled={isProcessing}
                        className={`w-full py-4 text-white font-bold rounded-xl transition shadow-lg flex items-center justify-center gap-2 ${isProcessing
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-cyan-600 hover:bg-cyan-700 shadow-cyan-200'
                            }`}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                PROCESANDO...
                            </>
                        ) : (
                            <>
                                <DollarSign size={20} /> CONFIRMAR PAGO
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Sub-component: Payment Method Selector
interface PaymentMethodSelectorProps {
    selected: PaymentMethod;
    onChange: (method: PaymentMethod) => void;
    disabled?: boolean;
}

function PaymentMethodSelector({ selected, onChange, disabled }: PaymentMethodSelectorProps) {
    const methods = [
        { key: 'CASH' as const, label: 'EFECTIVO', icon: Banknote, color: 'emerald' },
        { key: 'DEBIT' as const, label: 'TARJETA', icon: CreditCard, color: 'blue' },
        { key: 'TRANSFER' as const, label: 'TRANSF.', icon: Smartphone, color: 'purple' },
    ];

    return (
        <div className="grid grid-cols-3 gap-4 mb-8">
            {methods.map(({ key, label, icon: Icon, color }) => (
                <button
                    key={key}
                    onClick={() => onChange(key)}
                    disabled={disabled}
                    className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${selected === key
                        ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                        : 'border-slate-100 text-slate-400'
                        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    <Icon size={24} />
                    <span className="text-xs font-bold">{label}</span>
                </button>
            ))}
        </div>
    );
}

// Sub-component: Transfer ID Input
interface TransferIdInputProps {
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

function TransferIdInput({ value, onChange, disabled }: TransferIdInputProps) {
    return (
        <div className="mb-6 animate-in fade-in slide-in-from-top-2">
            <label className="block text-sm font-bold text-slate-700 mb-2">
                ID de Transacción
            </label>
            <input
                type="text"
                className="w-full p-3 border-2 border-slate-300 rounded-xl focus:border-purple-500 focus:outline-none"
                placeholder="Ej: 12345678 (Opcional)"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={disabled}
            />
            <p className="text-xs text-slate-400 mt-2 flex items-center">
                <AlertTriangle size={12} className="mr-1" />
                Puede ingresar el ID después en el historial si es necesario.
            </p>
        </div>
    );
}

// Sub-component: Loyalty Points Section
interface LoyaltyPointsSectionProps {
    customer: Customer;
    loyaltyConfig: { min_points_to_redeem: number };
    pointsToRedeem: number;
    onPointsChange: (points: number) => void;
    calculateDiscountValue: (points: number) => number;
    disabled?: boolean;
}

function LoyaltyPointsSection({
    customer,
    loyaltyConfig,
    pointsToRedeem,
    onPointsChange,
    calculateDiscountValue,
    disabled
}: LoyaltyPointsSectionProps) {
    const canRedeem = customer.totalPoints >= loyaltyConfig.min_points_to_redeem;

    return (
        <div className="mb-6 p-4 bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-200 rounded-2xl animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-amber-100 rounded-lg">
                        <Star size={20} className="text-amber-600" fill="currentColor" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-amber-900">Puntos Disponibles</p>
                        <p className="text-2xl font-extrabold text-amber-700">
                            {customer.totalPoints.toLocaleString()} pts
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-xs text-amber-600 font-semibold">Valor</p>
                    <p className="text-xl font-bold text-amber-700">
                        ${calculateDiscountValue(customer.totalPoints).toLocaleString()}
                    </p>
                </div>
            </div>

            {canRedeem ? (
                <>
                    <div className="border-t border-amber-200 my-3 pt-3">
                        <label className="block text-sm font-bold text-amber-900 mb-2">
                            Puntos a Canjear
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                min="0"
                                max={customer.totalPoints}
                                step={loyaltyConfig.min_points_to_redeem}
                                className="flex-1 p-3 border-2 border-amber-300 rounded-xl focus:border-amber-500 focus:outline-none font-bold text-lg bg-white"
                                placeholder={`Mín: ${loyaltyConfig.min_points_to_redeem}`}
                                value={pointsToRedeem || ''}
                                onChange={(e) => {
                                    const value = parseInt(e.target.value) || 0;
                                    onPointsChange(Math.min(value, customer.totalPoints));
                                }}
                                disabled={disabled}
                            />
                            <button
                                onClick={() => onPointsChange(customer.totalPoints)}
                                disabled={disabled}
                                className="px-4 py-2 bg-amber-200 text-amber-900 font-bold rounded-xl hover:bg-amber-300 transition whitespace-nowrap disabled:opacity-50"
                            >
                                Usar Todos
                            </button>
                        </div>
                    </div>

                    {pointsToRedeem > 0 && (
                        <div className="mt-3 p-3 bg-amber-100 rounded-xl border border-amber-300">
                            <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-amber-900">Descuento Aplicado:</span>
                                <span className="text-2xl font-extrabold text-emerald-600">
                                    - ${calculateDiscountValue(pointsToRedeem).toLocaleString()}
                                </span>
                            </div>
                            <p className="text-xs text-amber-600 mt-1">
                                Puntos restantes: {(customer.totalPoints - pointsToRedeem).toLocaleString()}
                            </p>
                        </div>
                    )}
                </>
            ) : (
                <div className="mt-3 p-2 bg-amber-100 rounded-lg border border-amber-300 text-center">
                    <p className="text-xs text-amber-700 font-semibold">
                        Se requieren {loyaltyConfig.min_points_to_redeem} puntos mínimo para canjear
                    </p>
                </div>
            )}
        </div>
    );
}

// Sub-component: Totals Display
interface TotalsDisplayProps {
    cartTotal: number;
    pointsToRedeem: number;
    pointsDiscount: number;
    finalTotal: number;
}

function TotalsDisplay({ cartTotal, pointsToRedeem, pointsDiscount, finalTotal }: TotalsDisplayProps) {
    return (
        <div className="mb-6 p-4 bg-slate-50 rounded-2xl border-2 border-slate-200">
            <div className="flex justify-between items-center mb-2">
                <span className="text-slate-600 font-semibold">Subtotal:</span>
                <span className="text-xl font-bold text-slate-800">
                    ${cartTotal.toLocaleString()}
                </span>
            </div>

            {pointsToRedeem > 0 && (
                <div className="flex justify-between items-center mb-2 text-emerald-600">
                    <span className="font-semibold flex items-center gap-1">
                        <Star size={16} fill="currentColor" />
                        Descuento por Puntos:
                    </span>
                    <span className="text-xl font-bold">
                        - ${pointsDiscount.toLocaleString()}
                    </span>
                </div>
            )}

            <div className="border-t-2 border-slate-300 mt-2 pt-2 flex justify-between items-center">
                <span className="text-slate-900 font-extrabold text-lg">TOTAL:</span>
                <span className="text-3xl font-extrabold text-cyan-600">
                    ${finalTotal.toLocaleString()}
                </span>
            </div>
        </div>
    );
}

export default PaymentModal;
