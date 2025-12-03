import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { X, RotateCcw, AlertTriangle, CheckCircle, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { SaleTransaction } from '../../../domain/types';

interface ReturnsModalProps {
    isOpen: boolean;
    onClose: () => void;
    sale: SaleTransaction;
}

const ReturnsModal: React.FC<ReturnsModalProps> = ({ isOpen, onClose, sale }) => {
    const { processReturn, employees } = usePharmaStore();

    const [reason, setReason] = useState('');
    const [managerPin, setManagerPin] = useState('');
    const [step, setStep] = useState<'REASON' | 'AUTH'>('REASON');

    if (!isOpen) return null;

    const handleNext = () => {
        if (reason.length < 5) {
            toast.error('Ingrese un motivo válido (mín. 5 caracteres)');
            return;
        }
        setStep('AUTH');
    };

    const handleProcessReturn = () => {
        const manager = employees.find(e => (e.role === 'MANAGER' || e.role === 'ADMIN') && e.access_pin === managerPin);

        if (!manager) {
            toast.error('PIN de Autorización inválido');
            return;
        }

        processReturn(sale.id, reason, manager.id);
        toast.success(`Devolución procesada correctamente (Autorizado por: ${manager.name})`);
        onClose();
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
                            <span className="font-bold text-slate-800">{sale.items.length} Productos</span>
                            <span className="font-bold text-red-600 text-lg">-${sale.total.toLocaleString()}</span>
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

                            <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-800 rounded-lg text-sm">
                                <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                                <p>Esta acción generará una Nota de Crédito interna, descontará el dinero de la caja y restaurará el stock al inventario.</p>
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
                                    className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-red-200"
                                >
                                    Confirmar Devolución
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
