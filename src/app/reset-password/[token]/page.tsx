'use client';

import React, { useState } from 'react'; // Removed useEffect since we don't validate on load strictly, action handles it.
import { resetPassword } from '@/actions/auth-recovery';
import { toast } from 'sonner';
import { ArrowLeft, Lock, Loader2, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
    const params = useParams();
    const router = useRouter();
    const token = params?.token as string;

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setIsLoading(true);

        try {
            const res = await resetPassword(token, password);
            if (res.success) {
                setIsSuccess(true);
                toast.success(res.message);
                setTimeout(() => router.push('/login'), 3000);
            } else {
                toast.error(res.message);
            }
        } catch (error) {
            toast.error('Error de conexión');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-cyan-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Lock className="text-cyan-600" size={32} />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">Restablecer Contraseña</h1>
                        <p className="text-slate-500 mt-2">
                            Crea una nueva contraseña segura para tu cuenta.
                        </p>
                    </div>

                    {!isSuccess ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Nueva Contraseña
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                                    placeholder="••••••••"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Confirmar Contraseña
                                </label>
                                <input
                                    type="password"
                                    required
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                                    placeholder="••••••••"
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-cyan-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="animate-spin" /> Procesando...
                                    </>
                                ) : (
                                    'Cambiar Contraseña'
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="text-center animate-in fade-in zoom-in">
                            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                <CheckCircle className="text-green-600" size={40} />
                            </div>
                            <h3 className="font-bold text-slate-800 text-xl mb-2">¡Contraseña Actualizada!</h3>
                            <p className="text-slate-500 text-sm mb-6">
                                Tu contraseña ha sido cambiada exitosamente. Redirigiendo al inicio de sesión...
                            </p>
                            <Link href="/login" className="px-6 py-2 bg-slate-100 text-slate-600 font-bold rounded-full hover:bg-slate-200 transition-colors">
                                Ir al Login ahora
                            </Link>
                        </div>
                    )}

                    {!isSuccess && (
                        <div className="mt-8 text-center">
                            <Link href="/login" className="text-slate-400 hover:text-slate-600 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                                <ArrowLeft size={16} /> Cancelar
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
