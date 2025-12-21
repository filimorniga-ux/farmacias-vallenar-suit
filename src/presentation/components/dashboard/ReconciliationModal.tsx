import React, { useState } from 'react';
import { DollarSign, AlertTriangle, CheckCircle, FileText, Calculator } from 'lucide-react';
import { toast } from 'sonner';
import { reconcileSession } from '@/actions/reconciliation';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    incident: {
        id: string; // session_id
        terminal_name: string;
        cashier_name: string;
        end_time: string;
        // Podríamos pasar el "expected_amount" si lo calculamos antes, o dejar que el backend juzgue
    };
    managerId: string;
}

export const ReconciliationModal: React.FC<Props> = ({ isOpen, onClose, incident, managerId }) => {
    const [realAmount, setRealAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!realAmount || !notes) {
            toast.warning('Debe ingresar el monto real y una justificación');
            return;
        }

        setIsSubmitting(true);
        const result = await reconcileSession({
            sessionId: incident.id,
            realClosingAmount: parseInt(realAmount),
            managerNotes: notes,
            managerId: managerId
        });

        setIsSubmitting(false);

        if (result.success) {
            const diff = result.difference || 0;
            const status = diff === 0 ? 'perfecto' : (diff > 0 ? `sobrante de $${diff}` : `faltante de $${diff}`);
            toast.success(`Conciliación exitosa. Resultado: ${status}`);
            onClose();
            // Aquí podríamos disparar una recarga del dashboard
            window.location.reload();
        } else {
            toast.error(result.error);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95">
                {/* Header de Alerta */}
                <div className="bg-amber-50 p-6 border-b border-amber-100 flex gap-4">
                    <div className="p-3 bg-amber-100 text-amber-600 rounded-full h-fit">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Conciliación de Cierre Forzado</h2>
                        <p className="text-sm text-slate-600 mt-1">
                            Está ajustando el cierre de la caja <strong>{incident.terminal_name}</strong> del usuario <strong>{incident.cashier_name}</strong>.
                        </p>
                    </div>
                </div>

                <div className="p-6 space-y-6">
                    {/* Input de Dinero */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            Dinero Real Contado (Efectivo)
                        </label>
                        <div className="relative">
                            <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input
                                type="number"
                                autoFocus
                                value={realAmount}
                                onChange={(e) => setRealAmount(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 text-2xl font-bold text-slate-800 bg-slate-50 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 outline-none transition-all"
                                placeholder="0"
                            />
                        </div>
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1">
                            <Calculator size={12} />
                            Ingrese el total de billetes y monedas encontrados en la gaveta.
                        </p>
                    </div>

                    {/* Justificación */}
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-2">
                            Notas de Auditoría
                        </label>
                        <textarea
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full p-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none text-sm"
                            rows={3}
                            placeholder="Ej: Conteo manual realizado por Gerencia. El cajero olvidó cerrar turno..."
                        />
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-lg transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSubmitting ? 'Procesando...' : (
                            <>
                                <CheckCircle size={18} /> Confirmar Conciliación
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
