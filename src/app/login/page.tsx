'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, UserRole } from '@/lib/store/auth';
import { Lock, User, KeyRound } from 'lucide-react';

export default function LoginPage() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const router = useRouter();
    const login = useAuthStore((state) => state.login);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        // Mock Auth Logic
        if (username === 'admin' && password === 'admin123') {
            login({ username: 'admin', role: 'ADMIN', name: 'Miguel (Admin)' });
            router.push('/');
        } else if (username === 'qf' && password === 'qf123') {
            login({ username: 'qf', role: 'QUIMICO', name: 'Químico Farmacéutico' });
            router.push('/');
        } else if (username === 'caja' && password === 'caja123') {
            login({ username: 'caja', role: 'VENDEDOR', name: 'Vendedor de Caja' });
            router.push('/');
        } else {
            setError('Credenciales inválidas. Intente nuevamente.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl">
                <div className="text-center">
                    <div className="mx-auto h-16 w-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                        <Lock className="h-8 w-8 text-blue-600" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900">
                        Farmacias Vallenar
                    </h2>
                    <p className="mt-2 text-sm text-gray-600">
                        Inicie sesión para acceder al sistema
                    </p>
                </div>
                <form className="mt-8 space-y-6" onSubmit={handleLogin}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <User className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Usuario"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />
                        </div>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <KeyRound className="h-5 w-5 text-gray-400" />
                            </div>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-3 pl-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Contraseña"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    {error && (
                        <div className="text-red-500 text-sm text-center bg-red-50 p-2 rounded">
                            {error}
                        </div>
                    )}

                    <div>
                        <button
                            type="submit"
                            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            Ingresar
                        </button>
                    </div>
                </form>

                <div className="mt-6">
                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-300" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-2 bg-white text-gray-500">
                                Credenciales de Prueba
                            </span>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs text-center text-gray-500">
                        <div className="bg-gray-50 p-2 rounded">
                            <span className="font-bold block">Admin</span>
                            admin / admin123
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                            <span className="font-bold block">Q.F.</span>
                            qf / qf123
                        </div>
                        <div className="bg-gray-50 p-2 rounded">
                            <span className="font-bold block">Caja</span>
                            caja / caja123
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
