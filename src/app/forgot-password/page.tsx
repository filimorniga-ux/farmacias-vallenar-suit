'use client';

import React, { useState } from 'react';
import { forgotPasswordSecure } from '@/actions/auth-recovery-v2';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Loader2, KeyRound } from 'lucide-react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        try {
            const res = await forgotPasswordSecure(email);
            if (res.success) {
                setIsSent(true);
                toast.success(res.message);
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
                            <KeyRound className="text-cyan-600" size={32} />
                        </div>
                        <h1 className="text-2xl font-bold text-slate-800">Recuperar Contraseña</h1>
                        <p className="text-slate-500 mt-2">
                            Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu acceso.
                        </p>
                    </div>

                    {!isSent ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Correo Electrónico
                                </label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-cyan-500 focus:outline-none transition-colors"
                                        placeholder="ejemplo@farmaciasvallenar.cl"
                                    />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-cyan-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="animate-spin" /> Enviando...
                                    </>
                                ) : (
                                    'Enviar Enlace'
                                )}
                            </button>
                        </form>
                    ) : (
                        <div className="text-center bg-cyan-50 p-6 rounded-xl border border-cyan-100 animate-in fade-in zoom-in">
                            <h3 className="font-bold text-cyan-800 text-lg mb-2">¡Enlace Enviado!</h3>
                            <p className="text-cyan-600 text-sm">
                                Hemos enviado las instrucciones a <strong>{email}</strong>. Por favor revisa tu bandeja de entrada.
                            </p>
                            <p className="text-xs text-cyan-500 mt-4">
                                (Si estás en modo desarrollo, revisa la consola del servidor)
                            </p>
                        </div>
                    )}

                    <div className="mt-8 text-center">
                        <Link href="/login" className="text-slate-400 hover:text-slate-600 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
                            <ArrowLeft size={16} /> Volver al Inicio de Sesión
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
