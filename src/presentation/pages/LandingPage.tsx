
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { Store, UserCircle, Clock, Ticket, ArrowRight, Loader2, RefreshCw, Search, Monitor, Command, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile } from '../../domain/types';
import PriceCheckerModal from '../components/public/PriceCheckerModal';

import { getUsersForLogin } from '../actions/login';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { login, employees, user, syncData } = usePharmaStore();
    const [localEmployees, setLocalEmployees] = useState<EmployeeProfile[]>([]);

    // Context State
    const [context, setContext] = useState<{ id: string, name: string, type: string } | null>(null);

    // Login UI State
    const [isLoginOpen, setIsLoginOpen] = useState(false);
    const [isPriceCheckOpen, setIsPriceCheckOpen] = useState(false);
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    // Security PIN State
    const [isPinModalOpen, setIsPinModalOpen] = useState(false);
    const [securityPin, setSecurityPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const [pinTarget, setPinTarget] = useState<'PRICE_CHECKER' | 'QUEUE_DISPLAY' | null>(null);

    // Queue Modal State
    const [isQueueOptionsOpen, setIsQueueOptionsOpen] = useState(false);

    // 🚀 AUTO-REDIRECT: Si ya hay sesión, ir directo al dashboard
    // 🚀 AUTO-REDIRECT: Si ya hay sesión, ir directo al dashboard
    useEffect(() => {
        // Check for session revocation flag to prevent infinite loops
        const params = new URLSearchParams(window.location.search);
        const reason = params.get('reason');

        if (reason === 'session_revoked') {
            console.log('🛑 Session revoked detected. Clearing ghost session...');
            usePharmaStore.getState().logout();
            return;
        }

        if (user) {
            console.log('🔄 Sesión restaurada, redirigiendo al dashboard...');
            // Cargar datos en background después de restaurar sesión
            syncData().catch(console.error);
            navigate('/dashboard', { replace: true });
        }
    }, [user, navigate, syncData]);

    // Initial Check - Location Context
    useEffect(() => {
        const locId = localStorage.getItem('preferred_location_id');
        if (!locId) {
            navigate('/select-context');
            return;
        }

        setContext({
            id: locId,
            name: localStorage.getItem('preferred_location_name') || 'Sucursal Identificada',
            type: localStorage.getItem('preferred_location_type') || 'STORE'
        });
    }, [navigate]);

    // Fetch employees if store is empty (Login Fix)
    useEffect(() => {
        if (employees.length > 0) {
            setLocalEmployees(employees);
        } else {
            getUsersForLogin().then(setLocalEmployees);
        }
    }, [employees]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee || !context) return;
        if (pin.length < 4) return;

        setIsLoading(true);
        setError('');

        try {
            // Login success triggers 'user' update in store
            // The useEffect hook monitors 'user' and handles navigation/sync
            const result = await login(selectedEmployee.id, pin, context.id);

            if (!result.success) {
                setError(result.error || 'Credenciales inválidas o sin permiso en esta sucursal');
                setPin('');
                setIsLoading(false); // Only stop loading on failure
            }
            // If success, keep loading true until redirect occurs via useEffect
        } catch (err) {
            console.error(err);
            setError('Error de conexión');
            setIsLoading(false);
        }
    };

    const handlePinSuccess = () => {
        setIsPinModalOpen(false);
        setSecurityPin('');

        if (pinTarget === 'PRICE_CHECKER') {
            setIsPriceCheckOpen(true);
        } else if (pinTarget === 'QUEUE_DISPLAY') {
            // Auto-configure display for this location
            if (context) {
                localStorage.setItem('queue_display_location_id', context.id);
                localStorage.setItem('queue_display_location_name', context.name);
                // ⚠️ CRITICAL: Must use window.location to escape React Router SPA and hit Next.js App Router
                window.location.href = '/display/queue';
            }
        }
        setPinTarget(null);
    };

    // Initial Loading Check
    if (!context) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <Loader2 className="animate-spin text-cyan-400" size={40} />
            </div>
        );
    }

    // Filter active employees
    const validEmployees = localEmployees.filter(e => {
        if (e.status !== 'ACTIVE') return false;

        // Admins and Managers are visible everywhere (Global Access)
        if (e.role === 'ADMIN' || e.role === 'MANAGER') return true;

        // Regular staff only visible in their assigned location
        return e.assigned_location_id === context.id;
    });

    const filteredEmployees = validEmployees.filter(emp =>
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (emp.job_title || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (!context) return null; // Or Loader

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Ambience - Light Clinical Blue/Teal */}
            <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
                <div className="absolute top-[5%] left-[10%] w-[600px] h-[600px] bg-sky-200/40 rounded-full blur-[120px]" />
                <div className="absolute bottom-[5%] right-[10%] w-[600px] h-[600px] bg-teal-100/30 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 w-full max-w-6xl">

                <header className="mb-12 text-center">
                    <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 tracking-tight mb-3">
                        Farmacias <span className="text-sky-600">Vallenar</span> Suit
                    </h1>
                    <div className="flex items-center justify-center gap-3 text-sky-800/80 mt-4 bg-white/80 py-2 px-5 rounded-full border border-sky-200 shadow-sm backdrop-blur-md inline-flex">
                        <Store size={18} className={context.type === 'WAREHOUSE' ? 'text-amber-500' : 'text-sky-500'} />
                        <span className="font-medium tracking-wide">Sucursal: <span className="font-bold text-slate-800">{context.name}</span></span>
                        <button
                            onClick={() => navigate('/select-context')}
                            className="ml-3 text-xs bg-sky-100 hover:bg-sky-200 text-sky-700 px-3 py-1.5 rounded-full transition-colors flex items-center border border-sky-200"
                        >
                            <RefreshCw size={10} className="mr-1.5" /> Cambiar
                        </button>
                    </div>
                </header>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                    {/* 1. Main System (ERP/POS) - Light Blue */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsLoginOpen(true)}
                        className="cursor-pointer bg-white border border-sky-100 rounded-3xl p-8 relative overflow-hidden shadow-xl shadow-sky-900/5 group hover:border-sky-300 transition-all hover:shadow-2xl hover:shadow-sky-900/10"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-10 bg-sky-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-20 transition-opacity" />
                        <div className="bg-sky-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-sky-100 group-hover:scale-110 transition-transform">
                            <UserCircle size={40} className="text-sky-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Iniciar Sesión</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Acceso clínico integral: ERP, Punto de Venta y Gestión.</p>
                        <div className="flex items-center text-xs font-bold text-sky-600 uppercase tracking-wider bg-sky-50 px-4 py-2 rounded-lg w-fit border border-sky-100 group-hover:bg-sky-500 group-hover:text-white transition-all">
                            Acceder <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 2. Attendance Kiosk - Light Teal */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/kiosk')}
                        className="cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-teal-300 transition-all hover:shadow-xl"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-teal-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-teal-200 group-hover:scale-110 transition-transform">
                            <Clock size={40} className="text-teal-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Reloj Control</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Registro de asistencia y turnos del personal.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-teal-600 group-hover:border-teal-200 transition-all">
                            Activar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 3. Customer Queue - Light Indigo */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setIsQueueOptionsOpen(true)}
                        className="cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-indigo-300 transition-all hover:shadow-xl"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-indigo-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-indigo-200 group-hover:scale-110 transition-transform">
                            <Ticket size={40} className="text-indigo-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Fila Virtual</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Totem de atención y pantalla de sala de espera.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-indigo-600 group-hover:border-indigo-200 transition-all">
                            Opciones <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 4. Logistics - Light Amber */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => navigate('/logistica')}
                        className="cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-amber-300 transition-all hover:shadow-xl"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-amber-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-amber-200 group-hover:scale-110 transition-transform">
                            <Store size={40} className="text-amber-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Logística</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Gestión WMS y operaciones de bodega.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-amber-600 group-hover:border-amber-200 transition-all">
                            Entrar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>

                    {/* 5. Price Checker - Light Emerald */}
                    <motion.div
                        whileHover={{ scale: 1.02, y: -5 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            setPinTarget('PRICE_CHECKER');
                            setIsPinModalOpen(true);
                        }}
                        className="cursor-pointer bg-white border border-slate-100 rounded-3xl p-8 relative overflow-hidden shadow-lg shadow-slate-900/5 group hover:border-emerald-300 transition-all hover:shadow-xl"
                    >
                        <div className="absolute top-0 right-0 p-4 opacity-5 bg-emerald-500 blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10 group-hover:opacity-10 transition-opacity" />
                        <div className="bg-slate-50 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 border border-slate-100 group-hover:border-emerald-200 group-hover:scale-110 transition-transform">
                            <Search size={40} className="text-emerald-500" />
                        </div>
                        <h3 className="text-2xl font-bold text-slate-800 mb-2">Consultor</h3>
                        <p className="text-slate-500 text-sm mb-6 leading-relaxed">Verificación pública de precios y stock.</p>
                        <div className="flex items-center text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 px-4 py-2 rounded-lg w-fit border border-slate-100 group-hover:text-emerald-600 group-hover:border-emerald-200 transition-all">
                            Consultar <ArrowRight size={14} className="ml-2" />
                        </div>
                    </motion.div>
                </div>

                {/* Desktop App Downloads - Light Clinical Refactor */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                    className="mt-12 flex flex-col md:flex-row items-center justify-center gap-6"
                >
                    <div className="bg-white/80 backdrop-blur-md border border-sky-100 rounded-3xl p-8 flex items-center gap-8 max-w-2xl w-full shadow-xl shadow-sky-900/5 transition-all">
                        <div className="bg-sky-100 w-16 h-16 rounded-2xl flex items-center justify-center text-sky-600 shrink-0 border border-sky-200">
                            <Download size={32} />
                        </div>
                        <div className="flex-1">
                            <h3 className="text-slate-900 font-bold text-xl mb-1">Instalar App Escritorio</h3>
                            <p className="text-slate-500 text-sm mb-5 leading-relaxed">
                                Versión profesional para Windows y Mac con impresión directa y modo POS optimizado.
                            </p>
                            <div className="flex flex-wrap gap-4">
                                <a
                                    href="/downloads/FarmaciasVallenar-Setup.exe"
                                    download
                                    className="flex items-center gap-2.5 px-5 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-xl transition-all text-sm font-bold border border-sky-100 shadow-sm"
                                >
                                    <Monitor size={18} className="text-sky-500" />
                                    <span>Windows</span>
                                </a>
                                <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
                                <a
                                    href="/downloads/FarmaciasVallenar-Mac-Universal.dmg"
                                    download
                                    className="flex items-center gap-2.5 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-all text-sm font-bold border border-slate-200 shadow-sm"
                                >
                                    <Command size={18} className="text-slate-500" />
                                    <span>macOS</span>
                                </a>
                            </div>
                        </div>
                    </div>
                </motion.div>

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
                                    <h2 className="text-2xl font-bold text-slate-800">Iniciar Sesión</h2>
                                    <p className="text-slate-500 text-sm">Validando para: <span className="font-bold text-sky-600">{context.name}</span></p>
                                </div>

                                {!selectedEmployee ? (
                                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {/* Search Bar */}
                                        <div className="relative mb-4 sticky top-0 z-10 bg-white pb-2">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                            <input
                                                type="text"
                                                placeholder="Buscar usuario..."
                                                value={searchTerm}
                                                onChange={(e) => setSearchTerm(e.target.value)}
                                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-slate-700 placeholder:text-slate-400 focus:ring-2 focus:ring-sky-500 outline-none transition-all"
                                                autoFocus
                                            />
                                        </div>

                                        {filteredEmployees.length === 0 ? (
                                            <div className="text-center py-8 text-slate-400">
                                                <p className="text-sm">No se encontraron usuarios.</p>
                                            </div>
                                        ) : (
                                            filteredEmployees.map(emp => (
                                                <button
                                                    key={emp.id}
                                                    onClick={() => setSelectedEmployee(emp)}
                                                    className="w-full flex items-center p-3 rounded-xl hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all group"
                                                >
                                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-colors ${emp.role === 'ADMIN' ? 'bg-sky-100 text-sky-600' : emp.role === 'MANAGER' ? 'bg-teal-100 text-teal-600' : 'bg-slate-100 text-slate-600'}`}>
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <div className="ml-3 text-left">
                                                        <p className="text-slate-800 font-bold text-sm">{emp.name}</p>
                                                        <p className="text-slate-400 text-xs">{emp.role === 'ADMIN' ? 'ADMINISTRADOR' : emp.role === 'MANAGER' ? 'GERENTE' : emp.job_title}</p>
                                                    </div>
                                                </button>
                                            )))}
                                    </div>
                                ) : (
                                    <form onSubmit={handleLogin} className="space-y-6">
                                        <div className="flex flex-col items-center">
                                            <div onClick={() => setSelectedEmployee(null)} className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-2xl font-bold text-slate-600 mb-2 cursor-pointer hover:bg-red-50 hover:text-red-500 transition-colors">
                                                {selectedEmployee.name.charAt(0)}
                                            </div>
                                        </div>
                                        <div className="text-center mb-4">
                                            <h3 className="font-bold text-slate-900 text-xl">{selectedEmployee.name}</h3>
                                            <p className="text-sm text-slate-400">{selectedEmployee.job_title || 'Empleado'}</p>
                                        </div>

                                        <input
                                            type="password"
                                            maxLength={8}
                                            autoFocus
                                            value={pin}
                                            onChange={(e) => {
                                                setPin(e.target.value.replace(/\D/g, '').slice(0, 8));
                                                setError('');
                                            }}
                                            placeholder="••••"
                                            className={`w-full text-center text-4xl font-bold py-3 border-b-4 ${error ? 'border-red-500 text-red-500' : 'border-slate-200 focus:border-sky-500 text-slate-800'} outline-none bg-transparent tracking-[1em]`}
                                            autoComplete="new-password"
                                        />

                                        {error && <p className="text-red-500 text-sm text-center font-bold">{error}</p>}

                                        <div className="grid grid-cols-2 gap-3">
                                            <button type="button" onClick={() => setSelectedEmployee(null)} className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Atrás</button>
                                            <button
                                                type="submit"
                                                disabled={isLoading || pin.length < 4}
                                                className="py-3 rounded-xl font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 transition-colors"
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

                {/* Queue Options Modal */}
                <AnimatePresence>
                    {isQueueOptionsOpen && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md relative"
                            >
                                <button onClick={() => setIsQueueOptionsOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">✕</button>

                                <div className="text-center mb-6">
                                    <div className="w-16 h-16 bg-sky-100 rounded-full flex items-center justify-center mx-auto mb-4 text-sky-600">
                                        <Ticket size={32} />
                                    </div>
                                    <h2 className="text-2xl font-bold text-slate-900">Sistema de Filas</h2>
                                    <p className="text-slate-500 text-sm">Selecciona una opción</p>
                                </div>

                                <div className="space-y-4">
                                    <button
                                        onClick={() => navigate('/totem')}
                                        className="w-full flex items-center p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-sky-500 hover:bg-sky-50 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center">
                                            <Ticket size={24} />
                                        </div>
                                        <div className="ml-4 text-left">
                                            <p className="font-bold text-slate-800">Abrir Totem</p>
                                            <p className="text-xs text-slate-500">Para tablet de ingreso de público.</p>
                                        </div>
                                        <ArrowRight size={20} className="ml-auto text-slate-300 group-hover:text-sky-500" />
                                    </button>

                                    <button
                                        onClick={() => {
                                            setIsQueueOptionsOpen(false);
                                            setPinTarget('QUEUE_DISPLAY');
                                            setIsPinModalOpen(true);
                                        }}
                                        className="w-full flex items-center p-4 rounded-2xl bg-slate-50 border border-slate-200 hover:border-teal-500 hover:bg-teal-50 transition-all group"
                                    >
                                        <div className="w-12 h-12 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center">
                                            <RefreshCw size={24} />
                                        </div>
                                        <div className="ml-4 text-left">
                                            <p className="font-bold text-slate-800">Activar Pantalla</p>
                                            <p className="text-xs text-slate-500">Para TV/Monitor de sala de espera.</p>
                                        </div>
                                        <ArrowRight size={20} className="ml-auto text-slate-300 group-hover:text-teal-500" />
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                {/* PIN Modal (Generalized) */}
                <AnimatePresence>
                    {isPinModalOpen && (
                        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4">
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="bg-white border border-slate-100 rounded-3xl p-8 w-full max-w-sm text-center relative shadow-2xl"
                            >
                                <button
                                    onClick={() => {
                                        setIsPinModalOpen(false);
                                        setSecurityPin('');
                                        setPinError(false);
                                        setPinTarget(null);
                                    }}
                                    className="absolute top-4 right-4 text-slate-500 hover:text-white transition-colors"
                                >✕</button>

                                <div className="mb-6">
                                    <div className="w-16 h-16 bg-sky-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-sky-500 border border-sky-100">
                                        <div className="flex">
                                            <span className="text-2xl font-bold">*</span>
                                            <span className="text-2xl font-bold">*</span>
                                            <span className="text-2xl font-bold">*</span>
                                        </div>
                                    </div>
                                    <h3 className="text-xl font-bold text-slate-800">Seguridad Admin</h3>
                                    <p className="text-slate-500 text-sm">Ingrese PIN administrativo para continuar</p>
                                </div>

                                <input
                                    type="password"
                                    autoFocus
                                    className={`w-full bg-slate-50 border-2 ${pinError ? 'border-red-500 text-red-500' : 'border-slate-100 text-slate-800 focus:border-sky-500'} rounded-xl py-4 text-center text-3xl font-bold tracking-[1em] outline-none transition-all mb-4`}
                                    maxLength={4}
                                    placeholder="••••"
                                    value={securityPin}
                                    onChange={(e) => {
                                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                                        setSecurityPin(val);
                                        setPinError(false);
                                        if (val === '1213') { // Admin/Master PIN
                                            handlePinSuccess();
                                        } else if (val.length === 4) {
                                            setPinError(true);
                                            setTimeout(() => setSecurityPin(''), 500);
                                        }
                                    }}
                                />
                                {pinError && <p className="text-red-500 text-sm font-bold animate-pulse">PIN Incorrecto</p>}
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <PriceCheckerModal
                    isOpen={isPriceCheckOpen}
                    onClose={() => setIsPriceCheckOpen(false)}
                />

                <footer className="mt-12 text-center text-slate-400 text-sm">
                    <p>&copy; 2025 Farmacias Vallenar. Todos los derechos reservados.</p>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
