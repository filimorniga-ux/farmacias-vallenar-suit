import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LogOut, X, Loader2, AlertTriangle, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { validateKioskExitPin } from '../../../actions/attendance-v2';
import { NumericKeypad } from './NumericKeypad';

interface ExitKioskModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export const ExitKioskModal: React.FC<ExitKioskModalProps> = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);

    // Reset state when opening
    useEffect(() => {
        if (isOpen) {
            setPin('');
            setError('');
        }
    }, [isOpen]);

    const handleDigit = (d: string) => {
        if (isValidating) return;
        setError('');
        setPin(prev => prev + d);
    };

    const handleDelete = () => {
        if (isValidating) return;
        setPin(prev => prev.slice(0, -1));
    };

    const handleSubmit = async () => {
        if (pin.length < 4 || isValidating) return;

        setIsValidating(true);
        try {
            const result = await validateKioskExitPin(pin);
            if (result.valid) {
                navigate('/');
            } else {
                setError(result.error || 'PIN no autorizado');
                setPin('');
            }
        } catch (e) {
            setError('Error de validación');
            setPin('');
        } finally {
            setIsValidating(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden relative"
                    >
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X size={20} />
                        </button>

                        <div className="p-8 pb-4 text-center">
                            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <LogOut size={32} />
                            </div>
                            <h3 className="text-xl font-extrabold text-slate-900 mb-2">Salir del Kiosco</h3>
                            <p className="text-slate-500 text-sm font-medium mb-6">Ingrese PIN de activación</p>

                            {/* PIN Display */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6 flex justify-center items-center h-16">
                                <div className="flex gap-3">
                                    {pin.length === 0 && <span className="text-slate-300 text-lg">****</span>}
                                    {pin.split('').map((_, i) => (
                                        <div key={i} className="w-3 h-3 rounded-full bg-slate-800" />
                                    ))}
                                </div>
                            </div>

                            {error && (
                                <div className="flex items-center gap-2 justify-center text-red-600 bg-red-50 p-3 rounded-xl mb-4 text-sm font-medium">
                                    <AlertTriangle size={16} />
                                    {error}
                                </div>
                            )}

                            <NumericKeypad
                                onDigit={handleDigit}
                                onDelete={handleDelete}
                                disabled={isValidating}
                                className="mb-6"
                            />

                            <button
                                onClick={handleSubmit}
                                disabled={pin.length < 4 || isValidating}
                                className="w-full h-14 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-xl font-bold text-lg shadow-lg shadow-red-200 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isValidating ? (
                                    <>
                                        <Loader2 className="animate-spin" size={24} />
                                        Validando...
                                    </>
                                ) : (
                                    <>
                                        Confirmar Salida
                                        <ArrowRight size={20} />
                                    </>
                                )}
                            </button>
                        </div>
                        <div className="bg-slate-50 p-4 text-center border-t border-slate-100">
                            <p className="text-xs text-slate-400">Esta acción cerrará la sesión del kiosco</p>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
