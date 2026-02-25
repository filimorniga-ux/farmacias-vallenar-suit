import React, { useState } from 'react';
import { calculateHandoverSecure, executeHandoverSecure, type HandoverSummary } from '@/actions/shift-handover-v2';
import { toast } from 'sonner';
import { Loader2, ArrowRight, CheckCircle, AlertTriangle, ShieldCheck, X } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
import { printHandoverTicket } from '@/presentation/utils/print-utils'; // New Import
import { HardwareConfig } from '@/domain/types'; // Import Type

interface ShiftHandoverModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ShiftHandoverModal: React.FC<ShiftHandoverModalProps> = ({ isOpen, onClose }) => {
    const { currentTerminalId, user, locations, currentLocationId, logoutShift, fetchTerminals } = usePharmaStore();

    const [step, setStep] = useState<'COUNT' | 'SUMMARY' | 'PROCESSING'>('COUNT');
    const [declaredAmount, setDeclaredAmount] = useState<string>('');
    const [summary, setSummary] = useState<HandoverSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [supervisorPin, setSupervisorPin] = useState<string>(''); // NEW: Supervisor PIN

    // Step 1: Calculate
    const handleCalculate = async () => {
        if (!currentTerminalId) return;
        // Clean separators (dots) for integer parsing
        const amount = Number(declaredAmount.replace(/\./g, ''));

        if (isNaN(amount) || amount < 0) {
            toast.error('Ingrese un monto válido');
            return;
        }

        setStep('PROCESSING');
        const res = await calculateHandoverSecure(currentTerminalId, amount);

        if (res.success && res.data) {
            console.log('✅ Handover Summary:', res.data);
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

        // Validar PINs antes de ejecutar

        if (!supervisorPin || supervisorPin.length < 4) {
            toast.error('Se requiere autorización de Supervisor');
            return;
        }

        setStep('PROCESSING');
        const res = await executeHandoverSecure({
            terminalId: currentTerminalId,
            declaredCash: summary.declaredCash,
            expectedCash: summary.expectedCash,
            amountToWithdraw: summary.amountToWithdraw,
            amountToKeep: summary.amountToKeep,
            userId: user.id,
            userPin: '', // Optional now
            supervisorPin: supervisorPin, // PASS NEW PIN
            notes: `Cambio de turno por ${user.name}`,
        });

        if (res.success) {
            toast.success('Cambio de turno registrado correctamente');

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

            // Limpiar sesión local de caja para evitar "sesión fantasma"
            logoutShift();
            if (currentLocationId) {
                await fetchTerminals(currentLocationId);
            }

            // Reiniciar estado interno del modal
            setDeclaredAmount('');
            setSummary(null);
            setSupervisorPin('');
            setStep('COUNT');
            onClose();
            toast.info('Turno transferido. El siguiente usuario debe iniciar sesión y retomar manualmente desde POS.');
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
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
                        <span className="sr-only">Cancelar</span>
                        <X size={24} />
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
                                    type="text"
                                    inputMode="numeric"
                                    autoFocus
                                    value={declaredAmount}
                                    onChange={(e) => {
                                        const raw = e.target.value.replace(/\D/g, '');
                                        if (raw) {
                                            const num = parseInt(raw, 10);
                                            setDeclaredAmount(num.toLocaleString('es-CL'));
                                        } else {
                                            setDeclaredAmount('');
                                        }
                                    }}
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
                                    <p className="text-[10px] text-gray-400 mt-1">
                                        (Base: ${summary.openingAmount.toLocaleString('es-CL')} + Ventas: ${summary.totalSales.toLocaleString('es-CL')})
                                    </p>
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
                                        Diferencia: <span className="font-mono font-bold">{summary.diff > 0 ? '+' : ''}{summary.diff.toLocaleString('es-CL')}</span>. Esta diferencia se registrará en auditoría de caja.
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
                                            <p className="text-slate-400 text-xs font-bold uppercase">Traspaso al Siguiente Turno</p>
                                            <p className="text-3xl font-mono font-bold text-amber-400">${summary.amountToKeep.toLocaleString('es-CL')}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-slate-400 text-xs font-bold uppercase">Remesa Automática</p>
                                            <p className="text-xl font-mono font-bold text-white">${summary.amountToWithdraw.toLocaleString('es-CL')}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 italic">
                                        * Al confirmar, se cierra el turno actual y el efectivo queda disponible para continuidad del siguiente cajero.
                                    </p>
                                </div>
                            </div>

                            {/* Desglose Detallado */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 text-sm space-y-2">
                                <h3 className="font-bold text-slate-700 border-b border-slate-100 pb-2 mb-2">📊 Desglose de Ventas y Movimientos</h3>

                                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                                    <span className="text-slate-500">Ventas Efectivo:</span>
                                    <span className="text-right font-mono">${summary.cashSales.toLocaleString('es-CL')}</span>

                                    <span className="text-slate-500">Ventas Tarjeta:</span>
                                    <span className="text-right font-mono">${(summary.cardSales || 0).toLocaleString('es-CL')}</span>

                                    <span className="text-slate-500">Transferencias:</span>
                                    <span className="text-right font-mono">${(summary.transferSales || 0).toLocaleString('es-CL')}</span>

                                    <span className="text-slate-500">Otros/Cheques:</span>
                                    <span className="text-right font-mono">${(summary.otherSales || 0).toLocaleString('es-CL')}</span>

                                    <div className="col-span-2 h-px bg-slate-100 my-1"></div>

                                    <span className="font-bold text-slate-700">Total Ventas:</span>
                                    <span className="text-right font-bold font-mono">${(summary.totalSales || 0).toLocaleString('es-CL')}</span>
                                </div>

                                <div className="mt-4 pt-2 border-t border-slate-100 grid grid-cols-2 gap-x-4 gap-y-1">
                                    <span className="text-green-600">Ingresos Manuales:</span>
                                    <span className="text-right font-mono text-green-600">+${summary.cashIn.toLocaleString('es-CL')}</span>

                                    <span className="text-red-500">Egresos/Gastos:</span>
                                    <span className="text-right font-mono text-red-500">-${summary.cashOut.toLocaleString('es-CL')}</span>
                                </div>
                            </div>

                            {/* PIN de Confirmación & Autorización */}
                            <div className="max-w-xs mx-auto w-full">

                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
                                    <label className="block text-xs font-bold text-amber-900 mb-2 uppercase flex items-center gap-1">
                                        <ShieldCheck size={12} /> PIN Supervisor
                                    </label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        maxLength={4}
                                        placeholder="••••"
                                        value={supervisorPin}
                                        onChange={(e) => setSupervisorPin(e.target.value.replace(/\D/g, ''))}
                                        className="w-full text-xl font-mono font-bold p-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-200 outline-none text-center"
                                    />
                                </div>
                            </div>

                            <button
                                onClick={handleConfirm}
                                disabled={!supervisorPin || supervisorPin.length !== 4}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/20 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <CheckCircle size={20} /> Validar y Cerrar Turno
                            </button>

                            <button
                                onClick={() => {
                                    setStep('COUNT');
                                }}
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
