'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, Role } from '@/lib/store/useAuthStore';
import { Lock, User, KeyRound, LogIn } from 'lucide-react';
import { logActionServer } from '@/actions/logger-action';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();
    const login = useAuthStore((state) => state.login);

    // Fetch shift status
    const [isShiftOpen, setIsShiftOpen] = useState(false);
    useEffect(() => {
        import('@/actions/operations').then(mod => {
            mod.getShiftStatus().then(setIsShiftOpen);
        });
    }, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Hardcoded credentials for MVP
        if (username === 'admin' && password === 'admin123') {
            login({ id: 1, username, role: 'ADMIN' });
            await logActionServer(username, 'LOGIN', 'Inicio de sesión exitoso (ADMIN)');
            router.push('/');
        } else if (username === 'qf' && password === 'qf123') {
            login({ id: 2, username, role: 'QF' });
            await logActionServer(username, 'LOGIN', 'Inicio de sesión exitoso (QF)');
            router.push('/');
        } else if (username === 'caja' && password === 'caja123') {
            login({ id: 3, username, role: 'VENDEDOR' });
            await logActionServer(username, 'LOGIN', 'Inicio de sesión exitoso (VENDEDOR)');
            router.push('/');
        } else {
            setError('Credenciales inválidas');
            // Optional: Log failed attempts?
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4 relative overflow-hidden">
            {/* Public Banner */}
            <div className={`absolute top-0 left-0 right-0 p-4 text-center text-white font-bold transition-colors ${isShiftOpen ? 'bg-green-600' : 'bg-slate-800'}`}>
                {isShiftOpen ? '🏥 FARMACIA DE TURNO - ABIERTO 24H' : '🕒 Horario de Atención: 09:00 - 21:00'}
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md mt-12">
                <div className="text-center mb-8">
                    <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                        <Lock className="text-white" size={32} />
                    </div>
                    <h1 className="text-2xl font-bold text-gray-800">Farmacias Vallenar</h1>
                    <p className="text-gray-500">Sistema de Gestión Integral</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm text-center font-medium border border-red-100">
                            {error}
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 block">Usuario</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                placeholder="Ingrese su usuario"
                                required
                                autoComplete="username"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700 block">Contraseña</label>
                        <div className="relative">
                            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                placeholder="••••••••"
                                required
                                autoComplete="current-password"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                    >
                        <LogIn size={20} />
                        Iniciar Sesión
                    </button>
                </form>

                <div className="mt-6 text-center text-xs text-gray-400">
                    <p>Credenciales de prueba:</p>
                    <p>admin / admin123</p>
                    <p>qf / qf123</p>
                    <p>caja / caja123</p>
                </div>

                <div className="mt-4 text-center">
                    <a href="/pantalla" className="text-sm text-blue-500 hover:underline">
                        Ver Pantalla Pública
                    </a>
                </div>
            </div>
        </div>
    );
}
