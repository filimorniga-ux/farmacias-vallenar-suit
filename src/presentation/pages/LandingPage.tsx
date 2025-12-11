
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { Store, MapPin, ArrowLeft, Loader2, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile, Location } from '../../domain/types';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { login, employees, fetchLocations, locations } = usePharmaStore();

    // UI State
    const [step, setStep] = useState<'LOCATION' | 'LOGIN'>('LOCATION');
    const [selectedLocation, setSelectedLocation] = useState<Location | null>(null);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    // Initial Load
    useEffect(() => {
        const load = async () => {
            setIsLoading(true);
            await fetchLocations(); // Ensure locations are available
            setIsLoading(false);

            // Check persistence
            const savedLoc = localStorage.getItem('context_location_id');
            if (savedLoc && locations.length > 0) {
                // Optional: Auto-select? Maybe better to let them confirm or auto-select if valid.
                // For now, let's just use it to highlight or pre-select if we wanted.
            }
        };
        load();
    }, [fetchLocations]); // Depend on fetchLocations stable ref

    const handleLocationSelect = (loc: Location) => {
        setSelectedLocation(loc);
        setStep('LOGIN');
        setPin('');
        setError('');
        setSelectedEmployee(null);
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee || !selectedLocation) return;
        if (pin.length < 4) return;

        setIsLoading(true);
        setError('');

        const success = await login(selectedEmployee.id, pin, selectedLocation.id);

        if (success) {
            // Redirect to Dashboard (App Entry)
            navigate('/dashboard');
        } else {
            setError('Credenciales inválidas o sin permiso en esta sucursal');
            setPin('');
        }
        setIsLoading(false);
    };

    // Filter employees - show all active (client filter logic can apply here if needed)
    // Maybe filter by location? "Verificar si user.assigned_location_id coincide"
    // Ideally we list ALL employees but block them if they try to enter wrong place.
    // Or better: filter list to only show valid employees for this location + Global Admins?
    // "Si un cajero de Centro intenta entrar a Prat, bloquear".
    // UX: Better to hide them? Or show them and error?
    // Let's show all for now, but maybe prioritize valid ones.
    const validEmployees = employees.filter(e => e.status === 'ACTIVE');

    return (
        <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[10%] left-[10%] w-96 h-96 bg-cyan-500/20 rounded-full blur-[128px]" />
                <div className="absolute bottom-[10%] right-[10%] w-96 h-96 bg-blue-600/20 rounded-full blur-[128px]" />
            </div>

            <div className="relative z-10 w-full max-w-5xl">

                <header className="mb-12 text-center">
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-2">
                        Farmacias <span className="text-cyan-400">Vallenar</span> Suit
                    </h1>
                    <p className="text-slate-400 font-medium text-lg">Sistema ERP Clínico Integral</p>
                </header>

                <AnimatePresence mode="wait">
                    {step === 'LOCATION' ? (
                        <motion.div
                            key="locations"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="w-full"
                        >
                            <h2 className="text-xl text-white font-bold mb-6 flex items-center justify-center gap-2">
                                <MapPin className="text-cyan-400" />
                                Selecciona tu Ubicación de Trabajo
                            </h2>

                            {isLoading && locations.length === 0 ? (
                                <div className="flex justify-center p-12">
                                    <Loader2 className="animate-spin text-cyan-400" size={48} />
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {locations.map(loc => (
                                        <button
                                            key={loc.id}
                                            onClick={() => handleLocationSelect(loc)}
                                            className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-500/50 rounded-2xl p-6 text-left transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-900/20"
                                        >
                                            <div className="flex items-start justify-between mb-4">
                                                <div className={`p-3 rounded-xl ${loc.type === 'HQ' ? 'bg-purple-500/20 text-purple-400' : 'bg-cyan-500/20 text-cyan-400'}`}>
                                                    <Store size={24} />
                                                </div>
                                                {loc.type === 'HQ' && (
                                                    <span className="bg-purple-500/20 text-purple-300 text-xs font-bold px-2 py-1 rounded-full uppercase">Casa Matriz</span>
                                                )}
                                            </div>
                                            <h3 className="text-2xl font-bold text-white mb-1">{loc.name}</h3>
                                            <p className="text-slate-400 text-sm mb-4">{loc.address}</p>

                                            <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider group-hover:text-cyan-400 transition-colors">
                                                Ingresar <ArrowRight size={14} className="ml-2 group-hover:translate-x-1 transition-transform" />
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="login"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="w-full max-w-md mx-auto"
                        >
                            <button
                                onClick={() => setStep('LOCATION')}
                                className="flex items-center text-slate-400 hover:text-white mb-6 text-sm font-bold transition-colors"
                            >
                                <ArrowLeft size={16} className="mr-2" />
                                Volver a sucursales
                            </button>

                            <div className="bg-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-cyan-400 to-blue-600" />

                                <div className="text-center mb-8">
                                    <h3 className="text-slate-500 text-sm font-bold uppercase tracking-wider mb-1">Iniciando en</h3>
                                    <h2 className="text-2xl font-extrabold text-slate-900">{selectedLocation?.name}</h2>
                                </div>

                                {!selectedEmployee ? (
                                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        <p className="text-center text-slate-400 text-sm mb-2">Selecciona tu usuario</p>
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
                                        <div className="flex items-center justify-center mb-6">
                                            <div className="flex flex-col items-center">
                                                <div onClick={() => setSelectedEmployee(null)} className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center text-3xl font-bold text-slate-600 mb-2 cursor-pointer hover:bg-red-100 hover:text-red-500 transition-colors relative group">
                                                    {selectedEmployee.name.charAt(0)}
                                                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 text-xs uppercase font-bold text-red-600">Cambiar</div>
                                                </div>
                                                <h3 className="font-bold text-lg text-slate-900">{selectedEmployee.name}</h3>
                                                <p className="text-slate-500 text-sm">{selectedEmployee.job_title}</p>
                                            </div>
                                        </div>

                                        <div>
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
                                                className={`w-full text-center text-4xl font-bold py-4 border-b-4 ${error ? 'border-red-500 text-red-500' : 'border-slate-200 focus:border-cyan-500 text-slate-800'} outline-none bg-transparent placeholder-slate-200 transition-colors tracking-[1em]`}
                                            />
                                        </div>

                                        {error && (
                                            <p className="text-red-500 text-sm text-center font-bold animate-pulse">
                                                {error}
                                            </p>
                                        )}

                                        <button
                                            type="submit"
                                            disabled={isLoading || pin.length < 4}
                                            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-cyan-200/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                                        >
                                            {isLoading ? <Loader2 className="animate-spin" /> : 'Ingresar al Turno'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        </motion.div>
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

import { ArrowRight } from 'lucide-react'; // Ensure imports logic is correct
