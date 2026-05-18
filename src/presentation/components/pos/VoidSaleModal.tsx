import React, { useState } from 'react';
import { AlertTriangle, Ban, Loader2, ShieldCheck, X } from 'lucide-react';
import { toast } from 'sonner';
import { voidSaleSecure } from '@/actions/sales-v2';

interface VoidSaleModalProps {
    isOpen: boolean;
    onClose: () => void;
    sale: {
        id: string;
        dte_folio?: string | number | null;
        amount?: number;
        total_amount?: number;
    };
    userId: string;
    onVoidComplete: () => void;
}

const VoidSaleModal: React.FC<VoidSaleModalProps> = ({
    isOpen,
    onClose,
    sale,
    userId,
    onVoidComplete,
}) => {
    const [reason, setReason] = useState('');
    const [pin, setPin] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const total = Number(sale.total_amount ?? sale.amount ?? 0);
    const canSubmit = reason.trim().length >= 10 && pin.trim().length >= 4 && !isSubmitting;

    const handleSubmit = async () => {
        if (reason.trim().length < 10) {
            toast.warning('Ingresa un motivo de al menos 10 caracteres');
            return;
        }

        if (pin.trim().length < 4) {
            toast.warning('Ingresa PIN de supervisor');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await voidSaleSecure({
                saleId: sale.id,
                userId,
                reason: reason.trim(),
                supervisorPin: pin.trim(),
            });

            if (!result.success) {
                toast.error(result.error || 'No se pudo anular la venta');
                return;
            }

            toast.success('Venta anulada y registrada en auditoría');
            onVoidComplete();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error anulando venta');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex items-center justify-between bg-slate-900 px-6 py-5 text-white">
                    <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-rose-500/15 p-2 text-rose-200">
                            <Ban size={22} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">Anular venta</h2>
                            <p className="text-xs font-semibold text-slate-400">
                                {sale.dte_folio ? `Documento #${sale.dte_folio}` : 'Venta sin folio'} · ${total.toLocaleString('es-CL')}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
                        aria-label="Cerrar anulación"
                    >
                        <X size={22} />
                    </button>
                </div>

                <div className="space-y-5 p-6">
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                        <div className="mb-1 flex items-center gap-2 font-bold">
                            <AlertTriangle size={18} />
                            Acción sensible
                        </div>
                        <p>
                            La venta quedará marcada como anulada, se restaurará el stock y el motivo quedará guardado en la bitácora.
                        </p>
                    </div>

                    <div>
                        <label className="mb-2 block text-sm font-bold text-slate-700">
                            Motivo de anulación
                        </label>
                        <textarea
                            value={reason}
                            onChange={(event) => setReason(event.target.value)}
                            placeholder="Ej: cliente solicitó cancelar la compra antes de retirar productos"
                            className="min-h-[110px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                            maxLength={500}
                        />
                        <p className="mt-1 text-xs text-slate-400">
                            Mínimo 10 caracteres. {reason.trim().length}/500
                        </p>
                    </div>

                    <div>
                        <label className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700">
                            <ShieldCheck size={16} />
                            PIN de supervisor
                        </label>
                        <input
                            type="password"
                            inputMode="numeric"
                            value={pin}
                            onChange={(event) => setPin(event.target.value)}
                            placeholder="••••"
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-xl font-bold tracking-[0.5em] text-slate-900 outline-none transition focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                            maxLength={8}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            className="min-h-12 rounded-xl bg-slate-100 font-bold text-slate-700 transition-colors hover:bg-slate-200 disabled:opacity-60"
                        >
                            Volver
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={!canSubmit}
                            className="min-h-12 rounded-xl bg-rose-600 font-bold text-white shadow-lg shadow-rose-600/20 transition-colors hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader2 className="animate-spin" size={18} />
                                    Anulando
                                </span>
                            ) : (
                                'Confirmar anulación'
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VoidSaleModal;
