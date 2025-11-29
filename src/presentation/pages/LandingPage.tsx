import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { ShoppingCart, Truck, Users, Clock, Lock, ArrowRight, BarChart3, Building2, Ticket, MapPin, ScanBarcode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile } from '../../domain/types';

const LandingPage: React.FC = () => {
    const navigate = useNavigate();
    const { login, logout, user, employees } = usePharmaStore();
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [targetRoute, setTargetRoute] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [step, setStep] = useState<'select' | 'pin'>('select');

    // Role mapping based on which card was clicked
    const ROUTE_TO_ROLES: Record<string, string[]> = {
        '/dashboard': ['MANAGER'],                    // Gerencia -> Only Manager
        '/inventory': ['MANAGER', 'QF', 'WAREHOUSE'], // Inventario -> Manager, QF, Warehouse
        '/pos': ['CASHIER', 'QF', 'MANAGER'],        // POS -> Cashiers, QF, Manager
        '/warehouse': ['WAREHOUSE', 'MANAGER'],       // Warehouse -> Warehouse staff, Manager
        '/network': ['MANAGER'],                      // Network -> Only Manager
    };

    // Filter employees based on target route
    const filteredEmployees = targetRoute && ROUTE_TO_ROLES[targetRoute]
        ? employees.filter(emp => ROUTE_TO_ROLES[targetRoute].includes(emp.role) && emp.status === 'ACTIVE')
        : employees.filter(emp => emp.status === 'ACTIVE');

    // Security: Auto-logout when landing on this page
    useEffect(() => {
        logout();
        // Sesión cerrada por seguridad al volver al inicio.
    }, []);

    // Navigate after successful login (when user state updates)
    useEffect(() => {
        if (user && targetRoute) {
            navigate(targetRoute);
            setTargetRoute(''); // Clear target route
        }
    }, [user, targetRoute, navigate]);

    const handleCardClick = (route: string) => {
        // ALL cards now require login for security
        if (user) {
            navigate(route);
        } else {
            setTargetRoute(route);
            setIsLoginModalOpen(true);
            setStep('select');
            setSelectedEmployee(null);
            setPin('');
            setError('');
        }
    };

    const handleEmployeeSelect = (employee: EmployeeProfile) => {
        setSelectedEmployee(employee);
        setStep('pin');
        setError('');
    };

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        if (login(selectedEmployee.id, pin)) {
            setIsLoginModalOpen(false);
            // Navigation will happen via useEffect when user state updates
        } else {
            setError('PIN Incorrecto');
            setPin('');
            // Shake animation will be handled by AnimatePresence
        }
    };

    const handleBack = () => {
        setStep('select');
        setSelectedEmployee(null);
        setPin('');
        setError('');
    };

    const BentoCard = ({ title, icon: Icon, color, route, desc }: any) => (
        <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`relative overflow-hidden rounded-3xl p-8 cursor-pointer shadow-xl transition-all ${color} text-white group`}
            onClick={() => handleCardClick(route)}
        >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon size={120} />
            </div>
            <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                    <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4 backdrop-blur-sm">
                        <Icon size={24} />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{title}</h3>
                    <p className="text-white/80 text-sm font-medium">{desc}</p>
                </div>
                <div className="flex items-center text-sm font-bold mt-4">
                    ACCEDER <ArrowRight size={16} className="ml-2" />
                </div>
            </div>
        </motion.div>
    );

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
            <header className="mb-12 text-center">
                <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mb-2">
                    Farmacias <span className="text-cyan-600">Vallenar</span> Suit
                </h1>
                <p className="text-slate-500 font-medium">Sistema ERP Clínico Integral v2.1</p>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl w-full">
                {/* Gerencia */}
                <BentoCard
                    title="GERENCIA & BI"
                    icon={BarChart3}
                    color="bg-gradient-to-br from-purple-600 to-pink-600"
                    route="/dashboard"
                    desc="Reportes y Análisis Ejecutivo"
                />

                {/* Administración */}
                <BentoCard
                    title="ADMINISTRACIÓN"
                    icon={Building2}
                    color="bg-gradient-to-br from-blue-500 to-cyan-600"
                    route="/inventory"
                    desc="Inventario y Gestión de Stock"
                />

                {/* POS */}
                <BentoCard
                    title="Punto de Venta"
                    icon={ShoppingCart}
                    color="bg-gradient-to-br from-emerald-500 to-teal-600"
                    route="/pos"
                    desc="Ventas, Recetas y Caja"
                />

                {/* Logística */}
                <BentoCard
                    title="Logística"
                    icon={Truck}
                    color="bg-gradient-to-br from-orange-400 to-red-500"
                    route="/warehouse"
                    desc="Inventario y Operaciones WMS"
                />

                {/* Network Manager - Only for Managers */}
                <BentoCard
                    title="GESTIÓN DE RED"
                    icon={MapPin}
                    color="bg-gradient-to-br from-slate-700 to-slate-900"
                    route="/network"
                    desc="Sucursales, Equipos y Kioscos"
                />

                {/* Kioscos & Terminales */}
                <BentoCard
                    title="RELOJ CONTROL"
                    icon={Clock}
                    color="bg-amber-500"
                    route="/access"
                    desc="Modo Kiosco para asistencia y marcaje biométrico."
                />

                <BentoCard
                    title="TOTEM DE FILAS"
                    icon={Ticket}
                    color="bg-pink-500"
                    route="/queue"
                    desc="Auto-atención de clientes y emisión de números."
                />

                <BentoCard
                    title="CONSULTOR DE PRECIOS"
                    icon={ScanBarcode}
                    color="bg-indigo-600"
                    route="/price-check"
                    desc="Escáner de precios para clientes"
                />
            </div>

            {/* Login Modal */}
            <AnimatePresence>
                {isLoginModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md"
                        >
                            {step === 'select' ? (
                                <>
                                    <div className="text-center mb-8">
                                        <div className="bg-cyan-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <Users className="text-cyan-700" size={32} />
                                        </div>
                                        <h2 className="text-2xl font-bold text-slate-900">¿Quién eres?</h2>
                                        <p className="text-slate-500">Selecciona tu perfil</p>
                                        {/* Debug Info */}
                                        <div className="mt-2 text-xs text-slate-400 space-y-1">
                                            <p>📊 Total Empleados: {employees.length}</p>
                                            <p>🎯 Filtrados: {filteredEmployees.length}</p>
                                            <p>📍 Ruta: {targetRoute}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        {filteredEmployees.length > 0 ? (
                                            filteredEmployees.map(emp => (
                                                <motion.button
                                                    key={emp.id}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleEmployeeSelect(emp)}
                                                    className="p-4 rounded-2xl border-2 border-slate-200 hover:border-cyan-500 hover:bg-cyan-50 transition-all group"
                                                >
                                                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold text-2xl mx-auto mb-2 group-hover:scale-110 transition-transform">
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <p className="font-bold text-slate-800 text-sm">{emp.name}</p>
                                                    <p className="text-xs text-slate-400">{emp.job_title}</p>
                                                </motion.button>
                                            ))
                                        ) : (
                                            <div className="col-span-2 text-center py-8 text-slate-400">
                                                <p>No hay usuarios disponibles para este módulo</p>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        onClick={() => setIsLoginModalOpen(false)}
                                        className="w-full py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition"
                                    >
                                        Cancelar
                                    </button>
                                </>
                            ) : (
                                <>
                                    <div className="text-center mb-8">
                                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold text-3xl mx-auto mb-4">
                                            {selectedEmployee?.name.charAt(0)}
                                        </div>
                                        <h2 className="text-2xl font-bold text-slate-900">{selectedEmployee?.name}</h2>
                                        <p className="text-slate-500">{selectedEmployee?.job_title}</p>
                                    </div>

                                    <form onSubmit={handleLogin} className="space-y-6">
                                        {/* Hidden username for accessibility */}
                                        <input
                                            type="text"
                                            name="username"
                                            autoComplete="username"
                                            className="hidden"
                                            readOnly
                                            value={selectedEmployee?.rut || ''}
                                        />

                                        <div>
                                            <label htmlFor="pin-input" className="block text-center text-sm font-bold text-slate-600 mb-2">
                                                Ingresa tu PIN de 4 dígitos
                                            </label>
                                            <motion.input
                                                id="pin-input"
                                                name="pin_access_code"
                                                key={error} // This will cause re-mount and trigger animation when error changes
                                                animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
                                                transition={{ duration: 0.4 }}
                                                type="password"
                                                maxLength={4}
                                                className={`w-full text-center text-4xl tracking-[1em] font-bold py-4 border-b-4 ${error ? 'border-red-500' : 'border-slate-200'} focus:border-cyan-600 focus:outline-none transition-colors text-slate-800 placeholder-slate-300`}
                                                placeholder="••••"
                                                value={pin}
                                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                                autoFocus
                                                autoComplete="new-password"
                                            />
                                        </div>

                                        {error && (
                                            <motion.p
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="text-red-500 text-center font-medium"
                                            >
                                                {error}
                                            </motion.p>
                                        )}

                                        <div className="grid grid-cols-2 gap-4">
                                            <button
                                                type="button"
                                                onClick={handleBack}
                                                className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition"
                                            >
                                                Atrás
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={pin.length < 4}
                                                className="py-3 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Ingresar
                                            </button>
                                        </div>
                                    </form>

                                    <div className="mt-8 text-center text-xs text-slate-400">
                                        <p>PIN Demo: Miguel (0000), Javiera (1234)</p>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Download Hub */}
            <div className="mt-16 text-center">
                <p className="text-slate-400 text-sm font-medium mb-4">Descargar Aplicación de Escritorio</p>
                <div className="flex gap-4 justify-center">
                    <a
                        href="https://github.com/miguelperdomo/farmacias-vallenar-suit/releases/latest/download/FarmaciasVallenar-Setup.exe"
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-cyan-500 hover:text-cyan-600 transition-colors shadow-sm"
                    >
                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/87/Windows_logo_-_2021.svg" alt="Windows" className="w-5 h-5" />
                        Windows
                    </a>
                    <a
                        href="https://github.com/miguelperdomo/farmacias-vallenar-suit/releases/latest/download/FarmaciasVallenar.dmg"
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-cyan-500 hover:text-cyan-600 transition-colors shadow-sm"
                    >
                        <img src="https://upload.wikimedia.org/wikipedia/commons/2/21/MacOS_wordmark_%282017%29.svg" alt="macOS" className="w-12" />
                        macOS
                    </a>
                </div>
                <p className="text-xs text-slate-300 mt-2">Versión de Escritorio v2.1</p>
            </div>
        </div>
    );
};

export default LandingPage;
