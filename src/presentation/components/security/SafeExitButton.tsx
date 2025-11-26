import React, { useState } from 'react';
import { LogOut, Lock, AlertTriangle } from 'lucide-react';
import { usePharmaStore } from '../../store/useStore';
import { useRouter } from 'next/navigation';

const SafeExitButton: React.FC = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const { employees } = usePharmaStore();
    const router = useRouter();

    const handleExit = (e: React.FormEvent) => {
        e.preventDefault();

        // Find employee with this PIN
        const supervisor = employees.find(emp => emp.access_pin === pin);

        if (supervisor && (supervisor.role === 'MANAGER' || supervisor.role === 'ADMIN')) {
            // Success: Allow exit
            // In a real app, we might log this event
            window.location.href = '/login'; // Force reload to clear state/hooks
        } else {
            setError('PIN inválido o sin permisos de supervisor');
            setPin('');
        }
    };

    return (
        <>
            <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-xl hover:bg-red-200 transition-colors font-bold text-sm"
            >
                <LogOut size={16} />
                <span className="hidden md:inline">Cerrar Turno</span>
            </button>

            {isModalOpen && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in fade-in zoom-in duration-200">
                        <div className="text-center mb-6">
                            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-600">
                                <Lock size={32} />
                            </div>
                            <h2 className="text-2xl font-bold text-slate-800">Salida Segura</h2>
                            <p className="text-slate-500 mt-2">
                                Para cerrar el turno y salir del modo Kiosco, se requiere autorización de un Supervisor.
                            </p>
                        </div>

                        <form onSubmit={handleExit} className="space-y-6">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
                                    PIN de Supervisor
                                </label>
                                <input
                                    type="password"
                                    maxLength={4}
                                    autoFocus
                                    className="w-full text-center text-3xl font-mono tracking-[1em] p-4 border-2 border-slate-200 rounded-2xl focus:border-red-500 focus:outline-none transition-colors"
                                    value={pin}
                                    onChange={e => {
                                        setPin(e.target.value);
                                        setError('');
                                    }}
                                    placeholder="••••"
                                />
                            </div>

                            {error && (
                                <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl flex items-center gap-2 font-bold justify-center">
                                    <AlertTriangle size={16} />
                                    {error}
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={() => { setIsModalOpen(false); setPin(''); setError(''); }}
                                    className="py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={pin.length !== 4}
                                    className="py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    Autorizar Salida
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
};

export default SafeExitButton;
