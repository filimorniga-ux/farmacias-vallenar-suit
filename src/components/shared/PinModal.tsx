'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Lock, X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

interface PinModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (pin: string) => Promise<boolean>;
    title: string;
    description?: string;
    requiredRole?: string;
}

export function PinModal({ isOpen, onClose, onSubmit, title, description, requiredRole }: PinModalProps) {
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
            setPin('');
            setError('');
            setSuccess(false);
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (pin.length < 4) {
            setError('PIN debe tener mínimo 4 dígitos');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await onSubmit(pin);
            if (result) {
                setSuccess(true);
                setTimeout(() => {
                    onClose();
                }, 500);
            } else {
                setError('PIN inválido o sin permisos');
                setPin('');
            }
        } catch (err: any) {
            setError(err.message || 'Error validando PIN');
            setPin('');
        } finally {
            setLoading(false);
        }
    };

    const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value.replace(/\D/g, '').slice(0, 8);
        setPin(value);
        setError('');
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl p-8 w-full max-w-md animate-in zoom-in-95 fade-in duration-300">
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                >
                    <X size={20} />
                </button>

                {/* Header */}
                <div className="text-center mb-6">
                    <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${success
                            ? 'bg-emerald-100 dark:bg-emerald-900/30'
                            : 'bg-indigo-100 dark:bg-indigo-900/30'
                        }`}>
                        {success ? (
                            <CheckCircle className="text-emerald-600 dark:text-emerald-400" size={32} />
                        ) : (
                            <Lock className="text-indigo-600 dark:text-indigo-400" size={32} />
                        )}
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                        {success ? '¡Autorizado!' : title}
                    </h2>
                    {description && !success && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                            {description}
                        </p>
                    )}
                    {requiredRole && !success && (
                        <div className="mt-3 inline-flex items-center px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-bold">
                            Requiere: {requiredRole}
                        </div>
                    )}
                </div>

                {/* Form */}
                {!success && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                                Ingrese su PIN de autorización
                            </label>
                            <input
                                ref={inputRef}
                                type="password"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={pin}
                                onChange={handlePinChange}
                                disabled={loading}
                                placeholder="••••••"
                                className="w-full text-center text-3xl tracking-[0.5em] font-mono p-4 border-2 border-slate-200 dark:border-slate-600 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 outline-none bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white disabled:opacity-50 transition-all"
                            />
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/20 p-3 rounded-lg">
                                <AlertCircle size={16} />
                                {error}
                            </div>
                        )}

                        {/* Buttons */}
                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={loading}
                                className="flex-1 px-4 py-3 rounded-xl font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading || pin.length < 4}
                                className="flex-1 px-4 py-3 rounded-xl font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={18} />
                                        Validando...
                                    </>
                                ) : (
                                    'Autorizar'
                                )}
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

export default PinModal;
