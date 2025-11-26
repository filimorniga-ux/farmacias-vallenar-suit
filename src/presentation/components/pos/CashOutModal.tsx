import React, { useState } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { X, DollarSign, AlertTriangle, Lock } from 'lucide-react';
import { PrinterService } from '../../../domain/services/PrinterService';
import { toast } from 'sonner';

interface CashOutModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CashOutModal: React.FC<CashOutModalProps> = ({ isOpen, onClose }) => {
    const { registerCashMovement, employees, currentShift, printerConfig } = usePharmaStore();

    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [type, setType] = useState<'GASTO' | 'RETIRO' | 'ADELANTO'>('GASTO');
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (!amount || !description || !pin) {
            setError('Todos los campos son obligatorios');
            return;
        }

        // Validate PIN (Manager/Admin only)
        const supervisor = employees.find(e => (e.role === 'MANAGER' || e.role === 'ADMIN') && e.access_pin === pin);

        if (!supervisor) {
            setError('PIN no autorizado o incorrecto');
            return;
        }

        if (!currentShift) {
            setError('No hay turno de caja abierto');
            return;
        }

        // Register Movement
        const movement = {
            type: 'OUT' as const,
            amount: Number(amount),
            description: `[${type}] ${description} (Auth: ${supervisor.name})`,
            reason: (type === 'RETIRO' || type === 'ADELANTO' ? 'WITHDRAWAL' : 'SUPPLIES') as any,
            is_cash: true
        };

        registerCashMovement(movement);

        // ...

        // Auto-Print
        PrinterService.printVoucher({
            ...movement,
            id: `MOV-${Date.now()}`,
            timestamp: Date.now(),
            shift_id: currentShift.id,
            user_id: supervisor.id
        }, printerConfig);

        toast.success('Retiro registrado y cajón abierto.');
        onClose();

        // Reset form
        setAmount('');
        setDescription('');
        setPin('');
        setError('');
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <DollarSign className="text-red-500" /> Retiro de Caja
                    </h3>
                    <button onClick={onClose}><X className="text-slate-400 hover:text-slate-600" /></button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Type Selector */}
                    <div className="grid grid-cols-3 gap-2">
                        {(['GASTO', 'RETIRO', 'ADELANTO'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setType(t)}
                                className={`py-2 px-1 rounded-xl text-xs font-bold border-2 transition-all ${type === t
                                    ? 'border-red-500 bg-red-50 text-red-700'
                                    : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                                    }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    {/* Amount */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Monto a Retirar</label>
                        <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input
                                type="number"
                                className="w-full pl-8 pr-4 py-3 border-2 border-slate-200 rounded-xl font-bold text-xl focus:border-red-500 focus:outline-none"
                                placeholder="0"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Motivo / Descripción</label>
                        <textarea
                            className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:outline-none text-sm"
                            rows={2}
                            placeholder="Ej: Compra de artículos de aseo..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    {/* Security PIN */}
                    <div className="bg-red-50 p-4 rounded-xl border border-red-100">
                        <div className="flex items-center gap-2 mb-2 text-red-800 font-bold text-xs uppercase tracking-wider">
                            <Lock size={12} /> Autorización Requerida
                        </div>
                        <input
                            type="password"
                            maxLength={4}
                            className="w-full p-3 border-2 border-red-200 rounded-xl font-bold text-center tracking-[1em] focus:border-red-500 focus:outline-none bg-white"
                            placeholder="••••"
                            value={pin}
                            onChange={(e) => {
                                setPin(e.target.value);
                                setError('');
                            }}
                        />
                        <p className="text-[10px] text-red-600/70 text-center mt-2">PIN de Gerente o Administrador</p>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-600 text-xs font-bold bg-red-50 p-3 rounded-lg">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    <button
                        onClick={handleSave}
                        className="w-full py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-200"
                    >
                        Confirmar Retiro
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CashOutModal;
