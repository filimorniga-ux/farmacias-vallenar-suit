
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { Store, UserCircle, Clock, Ticket, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile } from '../../domain/types';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { login, employees } = usePharmaStore();

    // Context State
    const [context, setContext] = useState<{ id: string, name: string, type: string } | null>(null);

    // Login UI State
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Initial Check
    useEffect(() => {
        const locId = localStorage.getItem('preferred_location_id');
        if (!locId) {
            navigate('/select-context');
            return;
        }

        // Load context details (Optimistic from localStorage or fetch if needed, 
        // but for speed we rely on stored name, or just ID if name missing)
        setContext({
            id: locId,
            name: localStorage.getItem('preferred_location_name') || 'Sucursal Identificada',
            type: localStorage.getItem('preferred_location_type') || 'STORE'
        });
    }, [navigate]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee || !context) return;
        if (pin.length < 4) return;

        setIsLoading(true);
        setError('');

        const success = await login(selectedEmployee.id, pin, context.id);

        if (success) {
            navigate('/dashboard');
        } else {
            setError('Credenciales inválidas o sin permiso en esta sucursal');
            setPin('');
        }
        setIsLoading(false);
    };

    // Filter active employees
    const validEmployees = employees.filter(e => e.status === 'ACTIVE');

    if (!context) return null; // Or Loader

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[10%] left-[10%] w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px]" />
                <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[128px]" />
            </div>

            <div className="relative z-10 w-full max-w-6xl">

                <header className="mb-12 text-center">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-2">
                        Farmacias <span className="text-cyan-400">Vallenar</span> Suit
                    </h1>
                    <div className="flex items-center justify-center gap-2 text-slate-400 mt-4">
                        <Store size={16} className={context.type === 'WAREHOUSE' ? 'text-orange-400' : 'text-cyan-400'} />
                        <span className="font-medium">Bienvenido a: <span className="text-white font-bold">{context.name}</span></span>
                        <button
                            onClick={() => navigate('/select-context')}
                            className="ml-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-md transition-colors flex items-center"
                        >
                            <RefreshCw size={10} className="mr-1" /> Cambiar
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                    {/* 1. Main System (ERP/POS) */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsLoginOpen(true)}
                        className="cursor-pointer bg-gradient-to-br from-cyan-600 to-blue-700 rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-cyan-900/40 border border-white/10 group"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 bg-white blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10" />
                        <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-6 text-white group-hover:scale-110 transition-transform">
                            <UserCircle size={40} />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Iniciar Sesión</h3>
                        <p className="text-cyan-100/90 text-sm mb-6">Acceso a ERP, Punto de Venta, Inventario y Administración.</p>
                        <div className="flex items-center text-xs font-bold text-white uppercase tracking-wider bg-white/20 px-4 py-2 rounded-lg w-fit backdrop-blur-md">
                            Entrar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 2. Attendance Kiosk */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/kiosk')}
                        className="cursor-pointer bg-gradient-to-br from-pink-500 to-rose-600 rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-pink-900/40 border border-white/10 group"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 bg-white blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10" />
                        <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-6 text-white group-hover:scale-110 transition-transform">
                            <Clock size={40} />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Reloj Control</h3>
                        <p className="text-pink-100/90 text-sm mb-6">Activar modo kiosco para registro de asistencia de personal.</p>
                        <div className="flex items-center text-xs font-bold text-white uppercase tracking-wider bg-white/20 px-4 py-2 rounded-lg w-fit backdrop-blur-md">
                            Activar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 3. Customer Queue Totem */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/totem')}
                        className="cursor-pointer bg-gradient-to-br from-purple-500 to-indigo-600 rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-purple-900/40 border border-white/10 group"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 bg-white blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10" />
                        <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-6 text-white group-hover:scale-110 transition-transform">
                            <Ticket size={40} />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Totem Filas</h3>
                        <p className="text-purple-100/90 text-sm mb-6">Activar dispensador de números para atención a público.</p>
                        <div className="flex items-center text-xs font-bold text-white uppercase tracking-wider bg-white/20 px-4 py-2 rounded-lg w-fit backdrop-blur-md">
                            Activar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 4. Logistics/WMS */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/warehouse')}
                        className="cursor-pointer bg-gradient-to-br from-orange-500 to-amber-600 rounded-3xl p-8 relative overflow-hidden shadow-2xl shadow-orange-900/40 border border-white/10 group"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 bg-white blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10" />
                        <div className="bg-white/20 w-16 h-16 rounded-2xl flex items-center justify-center backdrop-blur-sm mb-6 text-white group-hover:scale-110 transition-transform">
                            <Store size={40} />
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Logística</h3>
                        <p className="text-orange-100/90 text-sm mb-6">Acceso rápido a operaciones de bodega (WMS).</p>
                        <div className="flex items-center text-xs font-bold text-white uppercase tracking-wider bg-white/20 px-4 py-2 rounded-lg w-fit backdrop-blur-md">
                            Entrar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>
                </div>

                {/* Login Modal Overlay */}
                <AnimatePresence>
                    {isLoginOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md relative"
                            >
                                <button onClick={() => setIsLoginOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>

                                <div className="text-center mb-6">
                                    <h2 className="text-2xl font-bold text-slate-900">Iniciar Sesión</h2>
                                    <p className="text-slate-500 text-sm">Validando para: <span className="font-bold text-cyan-600">{context.name}</span></p>
                                </div>

                                {!selectedEmployee ? (
                                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                        {validEmployees.map(emp => (
                                            <button
                                                key={emp.id}
                                                onClick={() => setSelectedEmployee(emp)}
                                                className="w-full flex items-center p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                                            >
                                                <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold group-hover:bg-cyan-100 group-hover:text-cyan-700 transition-colors">
                                                    {emp.name.charAt(0)}
                                                </div>
                                                <div className="ml-3 text-left">
                                                    <p className="text-slate-800 font-bold text-sm">{emp.name}</p>
                                                    <p className="text-slate-400 text-xs">{emp.job_title}</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <form onSubmit={handleLogin} className="space-y-6">
                                        <div className="flex flex-col items-center">
                                            <div onClick={() => setSelectedEmployee(null)} className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-600 mb-2 cursor-pointer hover:bg-red-50 hover:text-red-500 transition-colors">
                                                {selectedEmployee.name.charAt(0)}
                                            </div>
                                            <h3 className="font-bold text-slate-900">{selectedEmployee.name}</h3>
                                        </div>

                                        <input
                                            type="password"
                                            maxLength={4}
                                            autoFocus
                                            value={pin}
                                            onChange={(e) => {
                                                setPin(e.target.value.replace(/\D/g, '').slice(0, 4));
                                                setError('');
                                            }}
                                            placeholder="••••"
                                            className={`w-full text-center text-4xl font-bold py-3 border-b-4 ${error ? 'border-red-500 text-red-500' : 'border-slate-200 focus:border-cyan-500 text-slate-800'} outline-none bg-transparent tracking-[1em]`}
                                            autoComplete="new-password"
                                        />

                                        {error && <p className="text-red-500 text-sm text-center font-bold">{error}</p>}

                                        <div className="grid grid-cols-2 gap-3">
                                            <button type="button" onClick={() => setSelectedEmployee(null)} className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Atrás</button>
                                            <button
                                                type="submit"
                                                disabled={isLoading || pin.length < 4}
                                                className="py-3 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
                                            >
                                                {isLoading ? '...' : 'Entrar'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <footer className="mt-12 text-center text-slate-600 text-sm">
                    <p>&copy; 2025 Farmacias Vallenar. Todos los derechos reservados.</p>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
