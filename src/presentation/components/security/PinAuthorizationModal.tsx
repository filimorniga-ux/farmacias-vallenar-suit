'use client';

/**
 * PIN Authorization Modal
 * 
 * Modal reutilizable para solicitar PIN de autorización en operaciones sensibles.
 * Usado para:
 * - Transferencias grandes
 * - Depósitos bancarios
 * - Confirmación de remesas
 * - Retiros significativos
 * 
 * @version 1.0.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { X, ShieldCheck, Lock, AlertTriangle } from 'lucide-react';

interface PinAuthorizationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (pin: string) => Promise<void>;
    title?: string;
    description?: string;
    operationType?: string;
    amount?: number;
    isLoading?: boolean;
    error?: string;
}

export function PinAuthorizationModal({
    isOpen,
    onClose,
    onConfirm,
    title = 'Autorización Requerida',
    description = 'Esta operación requiere autorización de un supervisor.',
    operationType,
    amount,
    isLoading = false,
    error
}: PinAuthorizationModalProps) {
    const [pin, setPin] = useState(['', '', '', '']);
    const [localError, setLocalError] = useState('');
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    // Focus first input when modal opens
    useEffect(() => {
        if (isOpen) {
            setPin(['', '', '', '']);
            setLocalError('');
            setTimeout(() => {
                inputRefs.current[0]?.focus();
            }, 100);
        }
    }, [isOpen]);

    // Handle input change
    const handleChange = (index: number, value: string) => {
        if (!/^\d*$/.test(value)) return; // Only digits

        const newPin = [...pin];
        newPin[index] = value.slice(-1); // Only last character
        setPin(newPin);
        setLocalError('');

        // Auto-focus next input
        if (value && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        // Auto-submit when complete
        if (index === 3 && value) {
            const fullPin = [...newPin.slice(0, 3), value.slice(-1)].join('');
            if (fullPin.length === 4) {
                handleSubmit(fullPin);
            }
        }
    };

    // Handle backspace
    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (e.key === 'Backspace' && !pin[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
        if (e.key === 'Enter') {
            const fullPin = pin.join('');
            if (fullPin.length === 4) {
                handleSubmit(fullPin);
            }
        }
        if (e.key === 'Escape') {
            onClose();
        }
    };

    // Handle paste
    const handlePaste = (e: React.ClipboardEvent) => {
        e.preventDefault();
        const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
        if (pastedData.length === 4) {
            setPin(pastedData.split(''));
            handleSubmit(pastedData);
        }
    };

    // Submit
    const handleSubmit = async (pinValue: string) => {
        if (pinValue.length !== 4) {
            setLocalError('Ingrese un PIN de 4 dígitos');
            return;
        }

        try {
            await onConfirm(pinValue);
        } catch (err: any) {
            setLocalError(err.message || 'Error de autorización');
            setPin(['', '', '', '']);
            inputRefs.current[0]?.focus();
        }
    };

    if (!isOpen) return null;

    const displayError = error || localError;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-amber-500/20 rounded-lg">
                                <ShieldCheck className="text-amber-400" size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">{title}</h2>
                                {operationType && (
                                    <p className="text-sm text-slate-300 mt-1">{operationType}</p>
                                )}
                            </div>
                        </div>
                        <button 
                            onClick={onClose} 
                            className="text-slate-400 hover:text-white transition-colors p-1"
                            disabled={isLoading}
                        >
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Amount Display (if provided) */}
                    {amount !== undefined && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                            <p className="text-sm text-amber-700 font-medium mb-1">Monto de la operación</p>
                            <p className="text-3xl font-mono font-bold text-amber-900">
                                ${amount.toLocaleString('es-CL')}
                            </p>
                        </div>
                    )}

                    {/* Description */}
                    <p className="text-slate-600 text-center">
                        {description}
                    </p>

                    {/* PIN Input */}
                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-slate-700 text-center">
                            <Lock className="inline mr-2" size={16} />
                            Ingrese PIN de Supervisor
                        </label>
                        
                        <div className="flex justify-center gap-3" onPaste={handlePaste}>
                            {pin.map((digit, index) => (
                                <input
                                    key={index}
                                    ref={el => { inputRefs.current[index] = el; }}
                                    type="password"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) => handleChange(index, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(index, e)}
                                    disabled={isLoading}
                                    className={`
                                        w-14 h-16 text-center text-2xl font-bold
                                        border-2 rounded-xl
                                        focus:border-amber-500 focus:ring-2 focus:ring-amber-200
                                        outline-none transition-all
                                        disabled:opacity-50 disabled:cursor-not-allowed
                                        ${displayError ? 'border-red-300 bg-red-50' : 'border-slate-200 bg-slate-50'}
                                    `}
                                />
                            ))}
                        </div>

                        {/* Error Message */}
                        {displayError && (
                            <div className="flex items-center justify-center gap-2 text-red-600 text-sm animate-in shake">
                                <AlertTriangle size={16} />
                                <span>{displayError}</span>
                            </div>
                        )}

                        {/* Loading State */}
                        {isLoading && (
                            <div className="flex items-center justify-center gap-2 text-slate-500 text-sm">
                                <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                                <span>Verificando autorización...</span>
                            </div>
                        )}
                    </div>

                    {/* Info */}
                    <p className="text-xs text-slate-400 text-center">
                        Solo personal autorizado (Gerente, Administrador) puede aprobar esta operación.
                    </p>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="flex-1 py-3 px-4 border border-slate-200 text-slate-600 rounded-xl font-medium hover:bg-slate-100 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => handleSubmit(pin.join(''))}
                        disabled={isLoading || pin.join('').length !== 4}
                        className="flex-1 py-3 px-4 bg-amber-500 text-white rounded-xl font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Verificando...
                            </>
                        ) : (
                            <>
                                <ShieldCheck size={18} />
                                Autorizar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PinAuthorizationModal;
