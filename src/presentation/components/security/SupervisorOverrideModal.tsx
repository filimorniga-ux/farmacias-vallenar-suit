import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Lock, X, CheckCircle, AlertTriangle, ShieldCheck, Loader2, RefreshCw, Wifi } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { canOverride } from '../../../domain/security/roles';
// SECURITY FIX: Server-side PIN validation with bcrypt
import { validateSupervisorPin } from '../../../actions/auth-v2';
// Retry utility for network issues
import { withServerActionRetry } from '../../../lib/retry';

interface SupervisorOverrideModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAuthorize: (authorizedBy: string) => void;
    actionDescription: string;
}

export const SupervisorOverrideModal: React.FC<SupervisorOverrideModalProps> = ({
    isOpen,
    onClose,
    onAuthorize,
    actionDescription
}) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [verifyTime, setVerifyTime] = useState(0);
    const [retryCount, setRetryCount] = useState(0);
    const { employees, user } = usePharmaStore();

    // Track verification time for slow network feedback
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isVerifying) {
            setVerifyTime(0);
            interval = setInterval(() => {
                setVerifyTime(t => t + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isVerifying]);

    const handleVerify = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (pin.length < 4) {
            setError('Ingrese un PIN válido de 4 dígitos');
            return;
        }

        setIsVerifying(true);
        setRetryCount(0);

        try {
            // SECURITY FIX: Server-side validation with bcrypt + retry for network issues
            const result = await withServerActionRetry(
                () => validateSupervisorPin(pin),
                {
                    maxAttempts: 3,
                    baseDelay: 500,
                    onRetry: (attempt) => {
                        setRetryCount(attempt);
                        console.log(`[SupervisorOverride] Retry ${attempt + 1}/3`);
                    }
                }
            );

            if (!result.success) {
                setError(result.error || 'PIN inválido. Intente nuevamente.');
                setPin('');
                setIsVerifying(false);
                return;
            }

            // Server already verifies role (MANAGER, ADMIN, GERENTE_GENERAL)
            if (!result.authorizedBy?.id) {
                setError('Error de validación. Intente nuevamente.');
                setPin('');
                setIsVerifying(false);
                return;
            }

            // Success - server validated with bcrypt
            const retryInfo = (result as any)._retryInfo;
            if (retryInfo && retryInfo.attempts > 1) {
                console.log(`✅ [SupervisorOverride] Authorized after ${retryInfo.attempts} attempts`);
            } else {
                console.log('✅ [SupervisorOverride] Authorized by:', result.authorizedBy?.name, '(bcrypt validated)');
            }
            onAuthorize(result.authorizedBy?.id!);
            setPin('');
            // onClose(); // Removed to prevent race condition with parent state update
        } catch (error) {
            console.error('Error validating supervisor PIN:', error);
            setError('Error de conexión. Intente nuevamente.');
        } finally {
            setIsVerifying(false);
            setRetryCount(0);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                >
                    <div className="bg-red-600 p-4 flex justify-between items-center text-white">
                        <div className="flex items-center gap-2">
                            <ShieldAlert size={24} />
                            <h2 className="font-bold text-lg">Autorización Requerida</h2>
                        </div>
                        <button onClick={onClose} className="hover:bg-red-700 p-1 rounded-full transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-6">
                        <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6 flex items-start gap-3">
                            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
                            <div>
                                <h3 className="font-bold text-red-800 text-sm mb-1">Acción Restringida</h3>
                                <p className="text-red-600 text-sm">{actionDescription}</p>
                            </div>
                        </div>

                        <form onSubmit={handleVerify} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">
                                    PIN de Supervisor (Manager/Admin)
                                </label>
                                <div className="relative">
                                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                    <input
                                        type="password"
                                        autoComplete="new-password"
                                        value={pin}
                                        onChange={(e) => setPin(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-lg tracking-widest text-center font-mono"
                                        placeholder="Ingrese PIN de 4 dígitos"
                                        maxLength={4}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {error && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-red-600 text-sm font-medium text-center bg-red-50 p-2 rounded-lg"
                                >
                                    {error}
                                </motion.div>
                            )}

                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    disabled={isVerifying}
                                    className="flex-1 py-3 px-4 border border-slate-300 text-slate-700 font-bold rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={pin.length < 4 || isVerifying}
                                    className="flex-1 py-3 px-4 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-200 flex items-center justify-center gap-2"
                                >
                                    {isVerifying ? (
                                        <>
                                            {retryCount > 0 ? (
                                                <RefreshCw size={18} className="animate-spin" />
                                            ) : (
                                                <Loader2 size={18} className="animate-spin" />
                                            )}
                                            {retryCount > 0
                                                ? `Reintentando (${retryCount + 1}/3)...`
                                                : verifyTime >= 3
                                                    ? 'Conectando...'
                                                    : 'Verificando...'
                                            }
                                        </>
                                    ) : (
                                        <>
                                            <ShieldCheck size={18} />
                                            Autorizar
                                        </>
                                    )}
                                </button>
                            </div>

                            {/* Slow network warning */}
                            {isVerifying && verifyTime >= 3 && (
                                <motion.div
                                    initial={{ opacity: 0, y: -5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-amber-600 text-xs font-medium text-center bg-amber-50 p-2 rounded-lg flex items-center justify-center gap-2"
                                >
                                    <Wifi size={14} className="animate-pulse" />
                                    Red lenta. Por favor espere...
                                </motion.div>
                            )}

                            {/* Security badge */}
                            <p className="text-[10px] text-center text-slate-400 mt-4 flex items-center justify-center gap-1">
                                <ShieldCheck size={10} /> Validación segura con cifrado bcrypt
                            </p>
                        </form>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
