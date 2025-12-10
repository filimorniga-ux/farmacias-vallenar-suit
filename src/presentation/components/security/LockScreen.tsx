'use client';

import React, { useState, useEffect } from 'react'; // Added React import
import { usePharmaStore } from '../../store/useStore';
import { authenticateUser } from '@/actions/auth';
import { Lock, AlertTriangle, Loader2 } from 'lucide-react';

interface LockScreenProps {
    isLocked: boolean;
    onUnlock: () => void;
}

export default function LockScreen({ isLocked, onUnlock }: LockScreenProps) {
    const { user } = usePharmaStore();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isValidating, setIsValidating] = useState(false);

    // Focus input when locked
    useEffect(() => {
        if (isLocked) {
            setPin('');
            setError('');
        }
    }, [isLocked]);

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!pin || !user) return;

        setIsValidating(true);
        setError('');

        try {
            // Validate PIN against current user
            const result = await authenticateUser(user.id, pin);

            if (result.success) {
                onUnlock();
            } else {
                setError(result.error || 'PIN Incorrecto');
                setPin('');
            }
        } catch (err) {
            setError('Error de conexión');
        } finally {
            setIsValidating(false);
        }
    };

    if (!isLocked) return null;

    return (
        <div className="fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-sm flex items-center justify-center animate-in fade-in duration-300">
            <div className="bg-white p-8 rounded-2xl shadow-2xl max-w-sm w-full mx-4 text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Lock className="text-red-600" size={40} />
                </div>

                <h2 className="text-2xl font-bold text-slate-800 mb-2">Sesión Bloqueada</h2>
                <p className="text-slate-500 mb-6">
                    Hola <strong>{user?.name.split(' ')[0]}</strong>, ingresa tu PIN para continuar.
                </p>

                <form onSubmit={handleUnlock}>
                    <input
                        type="password"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        placeholder="Ingresa tu PIN"
                        className="w-full text-center text-3xl font-mono tracking-widest py-4 border-2 border-slate-200 rounded-xl focus:border-red-500 focus:outline-none mb-4 transition-colors"
                        autoFocus
                        maxLength={4} // Assuming 4 digit PIN
                    />

                    {error && (
                        <div className="flex items-center justify-center gap-2 text-red-500 text-sm font-bold mb-4 bg-red-50 p-2 rounded-lg">
                            <AlertTriangle size={16} /> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isValidating || pin.length === 0}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-red-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isValidating ? <Loader2 className="animate-spin" /> : 'Desbloquear'}
                    </button>
                </form>
            </div>
        </div>
    );
}
