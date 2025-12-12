import React, { useState } from 'react';
import { calculateHandover, executeHandover, HandoverSummary } from '@/actions/shift-handover';
import { toast } from 'sonner';
import { Loader2, ArrowRight, CheckCircle, AlertTriangle, ShieldCheck } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { useRouter } from 'next/navigation';
import { printHandoverTicket } from '@/presentation/utils/print-utils'; // New Import
import { HardwareConfig } from '@/domain/types'; // Import Type

interface ShiftHandoverModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({ isOpen, onClose }) => {
    const { currentTerminalId, user, locations, currentLocationId } = usePharmaStore();
    const router = useRouter();

    const [step, setStep] = useState<'COUNT' | 'SUMMARY' | 'PROCESSING'>('COUNT');
    const [declaredAmount, setDeclaredAmount] = useState<string>('');
    const [summary, setSummary] = useState<HandoverSummary | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Step 1: Calculate
    const handleCalculate = async () => {
        if (!currentTerminalId) return;
        const amount = Number(declaredAmount);

        if (isNaN(amount) || amount < 0) {
            toast.error('Ingrese un monto válido');
            return;
        }

        setStep('PROCESSING');
        const res = await calculateHandover(currentTerminalId, amount);

        if (res.success && res.data) {
            setSummary(res.data);
            setStep('SUMMARY');
        } else {
            setError(res.error || 'Error calculando arqueo');
            setStep('COUNT');
        }
    };

    // Step 2: Execute
    const handleConfirm = async () => {
        if (!currentTerminalId || !summary || !user) return;

        setStep('PROCESSING');
        const res = await executeHandover(currentTerminalId, summary, user.id);

        if (res.success) {
            toast.success('Turno cerrado correctamente');

            // Print Ticket
            // Default Config for now
            const defaultConfig: HardwareConfig = {
                // id: 'default', // Managed by backend or context, not needed here manually if type forbids it
                // pos_printer_ip: '', // Removed as it is not in type
                pos_printer_width: '80mm',
                label_printer_size: '50x25',
                auto_print_pos: true,
                auto_print_labels: false,
                scanner_mode: 'KEYBOARD_WEDGE'
            };

            const locName = locations.find(l => l.id === currentLocationId)?.name || 'Sucursal';

            await printHandoverTicket(
                summary,
                user.name,
                currentTerminalId,
                locName,
                defaultConfig
            );

            onClose();
            // Force redirect or logout?
            // Ideally logout or refresh to show "Shift Closed" state
            window.location.href = '/access';
        } else {
            setError(res.error || 'Error cerrando turno');
            setStep('SUMMARY');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <ShieldCheck className="text-blue-600" /> Cambio de Turno
                        </h2>
                        <p className="text-xs text-gray-500">Protocolo de Cierre y Entrega de Caja</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                        <span className="sr-only">Cancelar</span>
                        Does not matter, close icon here
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6 overflow-y-auto">

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    {step === 'COUNT' && (
                        <div className="space-y-4 animate-in slide-in-from-right-4">
                            <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                                <p className="text-sm text-blue-800 font-medium">Instrucción:</p>
                                <p className="text-sm text-blue-600 mt-1">
                                    Realice el conteo físico de todo el efectivo en caja (billetes y monedas) e ingrese el total a continuación.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Efectivo Contado ($)</label>
                                <input
                                    type="number"
                                    autoFocus
                                    value={declaredAmount}
                                    onChange={(e) => setDeclaredAmount(e.target.value)}
                                    className="w-full text-3xl font-mono font-bold p-4 border rounded-xl focus:ring-4 focus:ring-blue-100 outline-none text-center"
                                    placeholder="0"
                                />
                            </div>

                            <button
                                onClick={handleCalculate}
                                disabled={!declaredAmount}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Siguiente: Ver Resumen <ArrowRight size={18} />
                            </button>
                        </div>
                    )}

                    {step === 'SUMMARY' && summary && (
                        <div className="space-y-6 animate-in slide-in-from-right-4">

                            {/* Comparison Card */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Sistema Espera</p>
                                    <p className="text-xl font-mono font-bold text-gray-800">${summary.expectedCash.toLocaleString('es-CL')}</p>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                                    <p className="text-xs text-gray-500 uppercase font-bold mb-1">Tú Declaraste</p>
                                    <p className="text-xl font-mono font-bold text-blue-700">${summary.declaredCash.toLocaleString('es-CL')}</p>
                                </div>
                            </div>

                            {/* Diff Alert */}
                            {summary.diff !== 0 ? (
                                <div className={`p-4 rounded-xl border ${summary.diff > 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                    <div className="flex items-center gap-2 font-bold mb-1">
                                        <AlertTriangle size={18} />
                                        {summary.diff > 0 ? 'Sobrante de Caja detected' : 'Faltante de Caja detected'}
                                    </div>
                                    <p className="text-sm opacity-90">
                                        Diferencia: <span className="font-mono font-bold">{summary.diff > 0 ? '+' : ''}{summary.diff.toLocaleString('es-CL')}</span>. Esta diferencia se registrará en Tesorería.
                                    </p>
                                </div>
                            ) : (
                                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl flex items-center gap-2 font-bold text-sm">
                                    <CheckCircle size={18} /> Caja Cuadrada Perfectamente
                                </div>
                            )}

                            {/* Handover Action Plan */}
                            <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg relative overflow-hidden">
                                <div className="relative z-10 space-y-4">
                                    <div className="flex justify-between items-end border-b border-slate-700 pb-4">
                                        <div>
                                            <p className="text-slate-400 text-xs font-bold uppercase">Entregar a Tesorería</p>
                                            <p className="text-3xl font-mono font-bold text-amber-400">${summary.amountToWithdraw.toLocaleString('es-CL')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-slate-400 text-xs font-bold uppercase">Dejar en Caja (Base)</p>
                                            <p className="text-xl font-mono font-bold text-white">${summary.amountToKeep.toLocaleString('es-CL')}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 italic">
                                        * Al confirmar, se generará una remesa por el monto a entregar. La caja se cerrará automáticamente.
                                    </p>
                                </div>
                            </div>

                            <button
                                onClick={handleConfirm}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-95"
                            >
                                <CheckCircle size={20} /> Confirmar Cierre y Entrega
                            </button>

                            <button
                                onClick={() => setStep('COUNT')}
                                className="w-full py-2 text-gray-500 text-sm hover:text-gray-800 underline"
                            >
                                Volver a Contar
                            </button>
                        </div>
                    )}

                    {step === 'PROCESSING' && (
                        <div className="py-12 flex flex-col items-center justify-center text-gray-500">
                            <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
                            <p className="font-medium animate-pulse">Procesando Cambio de Turno...</p>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
