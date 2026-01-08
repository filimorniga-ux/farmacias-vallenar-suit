import React, { useState, useEffect, useRef } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { User, UserPlus, ArrowRight, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CustomerCaptureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (customerRut: string) => void;
    onSkip: () => void;
}

const CustomerCaptureModal: React.FC<CustomerCaptureModalProps> = ({ isOpen, onClose, onConfirm, onSkip }) => {
    const { customers, addCustomer } = usePharmaStore();
    const [rut, setRut] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isNewCustomer, setIsNewCustomer] = useState(false);
    const [foundCustomer, setFoundCustomer] = useState<any>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            setRut('');
            setName('');
            setPhone('');
            setIsNewCustomer(false);
            setFoundCustomer(null);
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return;
            if (e.key === 'Escape') onSkip();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onSkip]);

    const formatRut = (value: string) => {
        const clean = value.replace(/[^0-9kK]/g, '');
        if (clean.length <= 1) return clean;
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1).toUpperCase();
        let formattedBody = '';
        for (let i = body.length - 1, j = 0; i >= 0; i--, j++) {
            formattedBody = body.charAt(i) + (j > 0 && j % 3 === 0 ? '.' : '') + formattedBody;
        }
        return `${formattedBody}-${dv}`;
    };

    const handleRutChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = formatRut(e.target.value);
        setRut(val);

        // Real-time search
        if (val.length >= 8) {
            const existing = customers.find(c => c.rut === val);
            if (existing) {
                setFoundCustomer(existing);
                setIsNewCustomer(false);
            } else {
                setFoundCustomer(null);
                // If it looks like a complete RUT, assume new
                if (val.length >= 9) setIsNewCustomer(true);
            }
        } else {
            setFoundCustomer(null);
            setIsNewCustomer(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (foundCustomer) {
            onConfirm(foundCustomer.rut);
        } else if (isNewCustomer && name) {
            // Register new
            const newCust = await addCustomer({
                rut,
                fullName: name,
                phone,
                email: '',
                registrationSource: 'POS',
                status: 'ACTIVE',
                tags: [],
                total_spent: 0
            });
            if (newCust) {
                onConfirm(newCust.rut);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
            >
                <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
                    <h3 className="text-xl font-bold flex items-center gap-2">
                        <User className="text-cyan-400" /> ¿A quién vendemos?
                    </h3>
                    <button onClick={onSkip} className="text-slate-400 hover:text-white text-xs font-bold uppercase tracking-wider">
                        Omitir (ESC)
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-8">
                    <div className="mb-6">
                        <label className="block text-sm font-bold text-slate-600 mb-2">RUT del Cliente</label>
                        <input
                            ref={inputRef}
                            type="text"
                            value={rut}
                            onChange={handleRutChange}
                            className="w-full p-4 text-3xl font-mono font-bold border-2 border-slate-200 rounded-2xl focus:border-cyan-500 focus:outline-none text-center uppercase"
                            placeholder="12.345.678-K"
                            maxLength={12}
                        />
                    </div>

                    <AnimatePresence mode="wait">
                        {foundCustomer && (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex items-center gap-4"
                            >
                                <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                                    <Check size={24} />
                                </div>
                                <div>
                                    <p className="text-emerald-800 font-bold text-lg">{foundCustomer.fullName}</p>
                                    <p className="text-emerald-600 text-sm">Cliente Registrado</p>
                                </div>
                            </motion.div>
                        )}

                        {isNewCustomer && !foundCustomer && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                className="space-y-4 mb-6 overflow-hidden"
                            >
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-blue-800 text-sm font-bold flex items-center gap-2">
                                    <UserPlus size={16} /> Cliente Nuevo - Registro Rápido
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Nombre Completo *</label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold focus:border-blue-500 focus:outline-none"
                                        placeholder="Ej: Juan Pérez"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono (Opcional)</label>
                                    <input
                                        type="tel"
                                        value={phone}
                                        onChange={(e) => setPhone(e.target.value)}
                                        className="w-full p-3 border-2 border-slate-200 rounded-xl font-bold focus:border-blue-500 focus:outline-none"
                                        placeholder="+569..."
                                    />
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="grid grid-cols-2 gap-4">
                        <button
                            type="button"
                            onClick={onSkip}
                            className="py-4 rounded-xl font-bold text-slate-500 hover:bg-slate-100 border-2 border-transparent hover:border-slate-200 transition-all"
                        >
                            Omitir
                        </button>
                        <button
                            type="submit"
                            disabled={!foundCustomer && (!isNewCustomer || !name)}
                            className="py-4 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {foundCustomer ? 'Confirmar' : 'Registrar'} <ArrowRight size={20} />
                        </button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};

export default CustomerCaptureModal;
