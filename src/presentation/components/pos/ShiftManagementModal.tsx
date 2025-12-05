import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { X, User, DollarSign, Monitor, Lock } from 'lucide-react';
import { toast } from 'sonner';

interface ShiftManagementModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const ShiftManagementModal: React.FC<ShiftManagementModalProps> = ({ isOpen, onClose }) => {
    const { terminals, employees, openShift, login } = usePharmaStore();

    const [selectedTerminal, setSelectedTerminal] = useState('');
    const [selectedCashier, setSelectedCashier] = useState('');
    const [openingAmount, setOpeningAmount] = useState('');
    const [managerPin, setManagerPin] = useState('');
    const [step, setStep] = useState<'DETAILS' | 'AUTH'>('DETAILS');

    if (!isOpen) return null;

    const availableTerminals = terminals.filter(t => t.status === 'CLOSED');
    const cashiers = employees.filter(e => ['CASHIER', 'QF', 'MANAGER', 'ADMIN'].includes(e.role));

    const handleNext = () => {
        if (!selectedTerminal || !selectedCashier || !openingAmount) {
            toast.error('Complete todos los campos');
            return;
        }
        setStep('AUTH');
    };

    const handleOpenShift = async () => {
        // Verify Manager PIN
        // In a real app, we would validate against the logged-in manager or a specific manager auth endpoint
        // For now, we'll simulate it by checking if any manager has this PIN
        const manager = employees.find(e => e.role === 'MANAGER' && e.access_pin === managerPin);

        if (!manager) {
            toast.error('PIN de Gerente inválido');
            return;
        }

        openShift(parseInt(openingAmount), selectedCashier, manager.id, selectedTerminal);
        toast.success('Turno abierto exitosamente');
        onClose();
        setStep('DETAILS');
        setManagerPin('');
        setOpeningAmount('');
        setSelectedTerminal('');
        setSelectedCashier('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                <div className="bg-slate-900 p-6 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <Monitor className="text-cyan-400" /> Apertura de Caja
                    </h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {step === 'DETAILS' ? (
                        <>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Terminal</label>
                                    <select
                                        value={selectedTerminal}
                                        onChange={(e) => setSelectedTerminal(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none"
                                    >
                                        <option value="">Seleccione Terminal...</option>
                                        {availableTerminals.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Cajero Asignado</label>
                                    <select
                                        value={selectedCashier}
                                        onChange={(e) => setSelectedCashier(e.target.value)}
                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none"
                                    >
                                        <option value="">Seleccione Cajero...</option>
                                        {cashiers.map(c => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-1">Fondo Inicial</label>
                                    <div className="relative">
                                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                        <input
                                            type="number"
                                            value={openingAmount}
                                            onChange={(e) => setOpeningAmount(e.target.value)}
                                            className="w-full pl-10 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-cyan-500 outline-none font-mono"
                                            placeholder="0"
                                        />
                                    </div>
                                </div>
                            </div>

                            <button
                                onClick={handleNext}
                                className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl transition-colors shadow-lg shadow-cyan-200"
                            >
                                Continuar
                            </button>
                        </>
                    ) : (
                        <div className="text-center space-y-6">
                            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto text-amber-600">
                                <Lock size={32} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Autorización Requerida</h3>
                                <p className="text-sm text-slate-500">Ingrese PIN de Gerente para confirmar apertura</p>
                            </div>

                            <input
                                type="password"
                                value={managerPin}
                                onChange={(e) => setManagerPin(e.target.value)}
                                className="w-full text-center text-2xl tracking-[0.5em] p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500 outline-none font-mono"
                                placeholder="••••"
                                maxLength={4}
                                autoFocus
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setStep('DETAILS')}
                                    className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
                                >
                                    Volver
                                </button>
                                <button
                                    onClick={handleOpenShift}
                                    className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-colors shadow-lg shadow-amber-200"
                                >
                                    Autorizar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ShiftManagementModal;
