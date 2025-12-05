import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { ShoppingCart, Truck, Users, Clock, Lock, ArrowRight, BarChart3, Building2, Ticket, MapPin, ScanBarcode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile } from '../../domain/types';
import AppIcon from '../components/ui/AppIcon';

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
    // Role mapping based on which card was clicked
    const ROUTE_TO_ROLES: Record<string, string[]> = {
        '/dashboard': ['MANAGER'],                    // Gerencia -> Only Manager
        '/inventory': ['MANAGER', 'QF', 'WAREHOUSE', 'ADMIN'], // Inventario -> Manager, QF, Warehouse, Admin
        '/pos': ['CASHIER', 'QF', 'MANAGER', 'ADMIN'],        // POS -> Cashiers, QF, Manager, Admin
        '/warehouse': ['WAREHOUSE', 'MANAGER', 'ADMIN'],       // Warehouse -> Warehouse staff, Manager, Admin
        '/network': ['MANAGER'],                      // Network -> Only Manager
        '/clients': ['MANAGER', 'ADMIN', 'CASHIER', 'QF'], // CRM -> Todos menos Bodega
        '/supply-chain': ['MANAGER', 'ADMIN', 'WAREHOUSE'], // Abastecimiento -> Manager, Admin, Bodega
        '/suppliers': ['MANAGER', 'ADMIN', 'WAREHOUSE'], // Proveedores -> Manager, Admin, Bodega
        '/settings': ['MANAGER'], // Configuración -> Solo Gerente
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

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;

        if (await login(selectedEmployee.id, pin)) {
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

    const BentoCard = ({ title, icon: Icon, gradient, shadowColor, route, desc }: { title: string, icon: any, gradient: string, shadowColor: string, route: string, desc: string }) => (
        <motion.div
            whileHover={{ scale: 1.05, y: -5 }}
            whileTap={{ scale: 0.98 }}
            className={`relative overflow-hidden rounded-3xl p-6 cursor-pointer bg-gradient-to-br ${gradient} shadow-xl shadow-${shadowColor}-500/30 hover:shadow-2xl hover:shadow-${shadowColor}-500/40 transition-all group border border-white/10`}
            onClick={() => handleCardClick(route)}
        >
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity bg-white blur-3xl w-32 h-32 rounded-full -mr-10 -mt-10"></div>

            <div className="relative z-10 flex flex-col h-full justify-between items-start">
                <div className="mb-6 bg-white/20 p-3 rounded-2xl backdrop-blur-sm shadow-inner border border-white/20 group-hover:scale-110 transition-transform">
                    <Icon className="text-white" size={32} />
                </div>

                <div>
                    <h3 className="text-xl font-extrabold text-white mb-2 leading-tight drop-shadow-sm">{title}</h3>
                    <p className="text-slate-100 text-sm font-medium leading-relaxed opacity-90">{desc}</p>
                </div>

                <div className="mt-6 flex items-center text-xs font-bold text-white uppercase tracking-wider group-hover:translate-x-1 transition-transform bg-white/20 px-3 py-1.5 rounded-lg backdrop-blur-sm border border-white/10">
                    Acceder <ArrowRight size={14} className="ml-2" />
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
                    gradient="from-indigo-500 to-purple-600"
                    shadowColor="indigo"
                    route="/dashboard"
                    desc="Reportes y Análisis Ejecutivo"
                />

                {/* Administración */}
                <BentoCard
                    title="ADMINISTRACIÓN"
                    icon={Building2}
                    gradient="from-cyan-500 to-blue-600"
                    shadowColor="cyan"
                    route="/inventory"
                    desc="Inventario y Gestión de Stock"
                />

                {/* POS */}
                <BentoCard
                    title="Punto de Venta"
                    icon={ShoppingCart}
                    gradient="from-emerald-400 to-cyan-600"
                    shadowColor="emerald"
                    route="/pos"
                    desc="Ventas, Recetas y Caja"
                />

                {/* Logística */}
                <BentoCard
                    title="Logística"
                    icon={Truck}
                    gradient="from-orange-400 to-pink-600"
                    shadowColor="orange"
                    route="/warehouse"
                    desc="Inventario y Operaciones WMS"
                />

                {/* Network Manager - Only for Managers */}
                <BentoCard
                    title="GESTIÓN DE RED"
                    icon={MapPin}
                    gradient="from-slate-700 to-slate-900"
                    shadowColor="slate"
                    route="/network"
                    desc="Sucursales, Equipos y Kioscos"
                />

                {/* Kioscos & Terminales */}
                <BentoCard
                    title="RELOJ CONTROL"
                    icon={Clock}
                    gradient="from-pink-500 to-rose-500"
                    shadowColor="pink"
                    route="/access"
                    desc="Modo Kiosco para asistencia y marcaje biométrico."
                />

                <BentoCard
                    title="TOTEM DE FILAS"
                    icon={Ticket}
                    gradient="from-fuchsia-500 to-purple-600"
                    shadowColor="fuchsia"
                    route="/queue"
                    desc="Auto-atención de clientes y emisión de números."
                />

                <BentoCard
                    title="CONSULTOR DE PRECIOS"
                    icon={ScanBarcode}
                    gradient="from-violet-500 to-indigo-600"
                    shadowColor="violet"
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
                                        <p>PIN Maestro: 1213 (Todos los usuarios)</p>
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
                        href="https://github.com/filimorniga-ux/farmacias-vallenar-suit/releases/latest/download/Farmacias-Vallenar-Suit-Setup.exe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-cyan-500 hover:text-cyan-600 transition-colors shadow-sm"
                    >
                        <img src="https://upload.wikimedia.org/wikipedia/commons/8/87/Windows_logo_-_2021.svg" alt="Windows" className="w-5 h-5" />
                        Descargar Última Versión
                    </a>
                    <a
                        href="https://github.com/filimorniga-ux/farmacias-vallenar-suit/releases/latest/download/Farmacias-Vallenar-Suit-arm64.dmg"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 rounded-xl text-slate-600 font-bold hover:border-cyan-500 hover:text-cyan-600 transition-colors shadow-sm"
                    >
                        <img src="https://upload.wikimedia.org/wikipedia/commons/2/21/MacOS_wordmark_%282017%29.svg" alt="macOS" className="w-12" />
                        Descargar Última Versión
                    </a>
                </div>
                <p className="text-xs text-slate-300 mt-2">Versión más reciente (Auto-actualizable)</p>
            </div>
        </div>
    );
};

export default LandingPage;
