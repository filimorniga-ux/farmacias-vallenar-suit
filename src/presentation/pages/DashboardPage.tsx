import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import { autoBackupService } from '../../domain/services/AutoBackupService';
import {
    ShoppingCart, Truck, Users, Clock, Lock, ArrowRight, BarChart3, Building2,
    TrendingUp, Wallet, CreditCard, ArrowDownRight, RefreshCw, MapPin, AlertTriangle, Snowflake,
    Cloud, Wifi, WifiOff, ChevronDown, Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { EmployeeProfile } from '../../domain/types';

const DashboardPage: React.FC = () => {
    const navigate = useNavigate();
    const { login, user, employees, salesHistory, expenses, inventory, attendanceLogs } = usePharmaStore();
    const { currentLocation, locations, switchLocation, canSwitchLocation } = useLocationStore();

    const [pin, setPin] = useState('');
    const [error, setError] = useState('');
    const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
    const [targetRoute, setTargetRoute] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState<EmployeeProfile | null>(null);
    const [step, setStep] = useState<'select' | 'pin'>('select');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isOnline, setIsOnline] = useState(true);

    // --- AUTO-BACKUP & NETWORK MONITOR ---
    useEffect(() => {
        autoBackupService.start();
        const updateOnlineStatus = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', updateOnlineStatus);
        window.addEventListener('offline', updateOnlineStatus);
        setIsOnline(navigator.onLine);
        return () => {
            autoBackupService.stop();
            window.removeEventListener('online', updateOnlineStatus);
            window.removeEventListener('offline', updateOnlineStatus);
        };
    }, []);

    // --- REAL-TIME DATA AGGREGATION ---
    const dashboardData = useMemo(() => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        // 1. Financials (Today)
        const todaySales = salesHistory.filter(s => s.timestamp >= startOfDay);
        const totalSales = todaySales.reduce((sum, s) => sum + s.total, 0);

        const cashSales = todaySales.filter(s => s.payment_method === 'CASH').reduce((sum, s) => sum + s.total, 0);
        const cardSales = todaySales.filter(s => s.payment_method === 'DEBIT' || s.payment_method === 'CREDIT').reduce((sum, s) => sum + s.total, 0);
        const transferSales = todaySales.filter(s => s.payment_method === 'TRANSFER').reduce((sum, s) => sum + s.total, 0);
        const digitalSales = cardSales + transferSales;

        const todayExpenses = expenses.filter(e => e.date >= startOfDay).reduce((sum, e) => sum + e.amount, 0);
        const cashInDrawer = cashSales - todayExpenses; // Simplified

        // 2. Staff On Duty
        const activeStaff = employees.filter(emp => emp.current_status === 'IN' || emp.current_status === 'LUNCH');

        // 3. Alerts
        const lowStockItems = inventory.filter(i => i.stock_actual <= (i.stock_min || 5)).length;
        const infrastructureAlert = true; // Hardcoded for now as per request "Pagar Vercel pronto"

        return {
            totalSales,
            cashInDrawer,
            digitalSales,
            todayExpenses,
            activeStaff,
            lowStockItems,
            infrastructureAlert
        };
    }, [salesHistory, expenses, employees, inventory, currentLocation]);

    // --- HANDLERS ---
    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1500);
    };

    const handleLocationSwitch = (locId: string) => {
        switchLocation(locId);
    };

    // --- NAVIGATION & LOGIN LOGIC ---
    const ROUTE_TO_ROLES: Record<string, string[]> = {
        '/reports': ['MANAGER'],
        '/settings': ['MANAGER', 'ADMIN', 'QF'],
        '/pos': ['CASHIER', 'QF', 'MANAGER'],
        '/warehouse': ['WAREHOUSE', 'MANAGER'],
    };

    const filteredEmployees = targetRoute && ROUTE_TO_ROLES[targetRoute]
        ? employees.filter(emp => ROUTE_TO_ROLES[targetRoute].includes(emp.role) && emp.status === 'ACTIVE')
        : employees.filter(emp => emp.status === 'ACTIVE');

    useEffect(() => {
        if (user && targetRoute) {
            navigate(targetRoute);
            setTargetRoute('');
        }
    }, [user, targetRoute, navigate]);

    const handleCardClick = (route: string) => {
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
        } else {
            setError('PIN Incorrecto');
            setPin('');
        }
    };

    const handleBack = () => {
        setStep('select');
        setSelectedEmployee(null);
        setPin('');
        setError('');
    };

    // --- COMPONENTS ---
    const FinancialCard = ({ title, value, icon: Icon, gradient, shadowColor, trend }: any) => (
        <div className={`bg-gradient-to-br ${gradient} p-5 rounded-2xl shadow-lg shadow-${shadowColor}-500/30 text-white relative overflow-hidden group hover:scale-105 transition-transform duration-300`}>
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                <Icon size={64} />
            </div>
            <div className="flex justify-between items-start mb-2 relative z-10">
                <div className="p-2 rounded-xl bg-white/20 backdrop-blur-sm">
                    <Icon size={20} className="text-white" />
                </div>
                {trend && (
                    <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full backdrop-blur-sm flex items-center">
                        <TrendingUp size={12} className="mr-1" /> {trend}
                    </span>
                )}
            </div>
            <div className="relative z-10">
                <p className="text-white/80 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold mt-1">{value}</h3>
            </div>
        </div>
    );

    const ModuleCard = ({ title, icon: Icon, gradient, shadowColor, route }: any) => (
        <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleCardClick(route)}
            className={`flex flex-col items-center justify-center p-4 bg-gradient-to-br ${gradient} rounded-2xl shadow-lg shadow-${shadowColor}-500/30 border border-white/10 hover:shadow-2xl hover:shadow-${shadowColor}-500/40 hover:scale-105 transition-all duration-300 h-24 group relative overflow-hidden`}
        >
            <div className="absolute top-0 left-0 w-full h-full bg-white/10 opacity-0 group-hover:opacity-20 transition-opacity" />
            <div className="bg-white/20 p-2 rounded-full text-white mb-2 backdrop-blur-sm group-hover:scale-110 transition-transform shadow-inner border border-white/20">
                <Icon size={20} />
            </div>
            <span className="text-xs font-bold text-white text-center leading-tight drop-shadow-sm">{title}</span>
        </motion.button>
    );

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* HEADER */}
            <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-slate-200 px-6 py-4">
                <div className="max-w-4xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">Hola, {user?.name || 'Invitado'}</h1>
                        <p className="text-xs text-slate-500 font-medium">{user?.role === 'MANAGER' ? 'Gerente General' : user?.role || 'Usuario'}</p>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Location Selector */}
                        <div className="relative group">
                            <button className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-700 transition-colors">
                                <MapPin size={16} className="text-cyan-600" />
                                {currentLocation?.name || 'Seleccionar Sucursal'}
                                <ChevronDown size={14} className="text-slate-400" />
                            </button>
                            {/* Dropdown (Simplified) */}
                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden hidden group-hover:block animate-in fade-in slide-in-from-top-2">
                                {locations.map(loc => (
                                    <button
                                        key={loc.id}
                                        onClick={() => handleLocationSwitch(loc.id)}
                                        className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-slate-50 ${currentLocation?.id === loc.id ? 'text-cyan-600 bg-cyan-50' : 'text-slate-600'}`}
                                    >
                                        {loc.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button onClick={handleRefresh} className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${isRefreshing ? 'animate-spin text-cyan-600' : 'text-slate-400'}`}>
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </div>
            </header>

            <main className="p-6 space-y-8 max-w-md mx-auto md:max-w-4xl">

                {/* 1. FINANCIAL PULSE */}
                <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <FinancialCard
                        title="Venta Total"
                        value={`$${dashboardData.totalSales.toLocaleString()}`}
                        icon={BarChart3}
                        gradient="from-emerald-400 to-cyan-600"
                        shadowColor="emerald"
                        trend="+12%"
                    />
                    <FinancialCard
                        title="Efectivo Caja"
                        value={`$${dashboardData.cashInDrawer.toLocaleString()}`}
                        icon={Wallet}
                        gradient="from-blue-400 to-indigo-600"
                        shadowColor="blue"
                    />
                    <FinancialCard
                        title="Venta Digital"
                        value={`$${dashboardData.digitalSales.toLocaleString()}`}
                        icon={CreditCard}
                        gradient="from-violet-500 to-purple-600"
                        shadowColor="violet"
                    />
                    <FinancialCard
                        title="Gastos"
                        value={`-$${dashboardData.todayExpenses.toLocaleString()}`}
                        icon={ArrowDownRight}
                        gradient="from-red-400 to-rose-600"
                        shadowColor="red"
                    />
                </section>

                {/* 2. LIVE OPERATION */}
                <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Active Staff */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Users size={18} className="text-cyan-600" /> Personal Activo
                            </h3>
                            <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">
                                {dashboardData.activeStaff.length} Presentes
                            </span>
                        </div>
                        <div className="space-y-3">
                            {dashboardData.activeStaff.length > 0 ? (
                                dashboardData.activeStaff.map(emp => (
                                    <div key={emp.id} className="flex items-center justify-between p-2 hover:bg-slate-50 rounded-xl transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white font-bold text-xs">
                                                {emp.name.charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{emp.name}</p>
                                                <p className="text-[10px] text-slate-400">{emp.job_title}</p>
                                            </div>
                                        </div>
                                        <div className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                            <Clock size={12} /> 08:30
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-slate-400 text-center py-4">No hay personal activo</p>
                            )}
                        </div>
                    </div>

                    {/* Alerts & Notifications */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 flex flex-col gap-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Bell size={18} className="text-amber-500" /> Alertas & Avisos
                        </h3>

                        {/* Stock Alert */}
                        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-100 rounded-xl">
                            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <p className="text-sm font-bold text-red-700">{dashboardData.lowStockItems} Productos Críticos</p>
                                <p className="text-xs text-red-500">Stock bajo el mínimo permitido.</p>
                            </div>
                        </div>

                        {/* Infrastructure Alert (Small) */}
                        <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl mt-auto">
                            <div className="p-2 bg-slate-200 text-slate-600 rounded-lg">
                                <Cloud size={20} />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-700">Próximo pago servidor</p>
                                <p className="text-xs text-slate-500">Vence en 5 días (Vercel)</p>
                            </div>
                            <button onClick={() => navigate('/settings')} className="text-xs font-bold text-cyan-600 hover:underline">
                                Ver
                            </button>
                        </div>
                    </div>
                </section>

                {/* 3. QUICK ACCESS MODULES */}
                <section>
                    <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Módulos de Sistema</h2>
                    <div className="grid grid-cols-4 gap-3">
                        <ModuleCard
                            title="Ventas"
                            icon={ShoppingCart}
                            gradient="from-emerald-400 to-cyan-600"
                            shadowColor="cyan"
                            route="/pos"
                        />
                        <ModuleCard
                            title="Bodega"
                            icon={Truck}
                            gradient="from-orange-400 to-pink-600"
                            shadowColor="orange"
                            route="/warehouse"
                        />
                        <ModuleCard
                            title="Admin"
                            icon={Building2}
                            gradient="from-indigo-500 to-purple-600"
                            shadowColor="indigo"
                            route="/settings"
                        />
                        <ModuleCard
                            title="Reportes"
                            icon={BarChart3}
                            gradient="from-blue-400 to-indigo-600"
                            shadowColor="blue"
                            route="/reports"
                        />
                    </div>
                </section>

            </main>

            {/* FAB for Detailed Reports */}
            <div className="fixed bottom-6 right-6">
                <button
                    onClick={() => handleCardClick('/reports')}
                    className="bg-slate-900 text-white p-4 rounded-full shadow-xl shadow-slate-400/50 hover:scale-105 transition-transform flex items-center gap-2"
                >
                    <BarChart3 size={24} />
                    <span className="font-bold text-sm pr-2 hidden md:inline">Reporte Completo</span>
                </button>
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
                                    </div>

                                    <div className="grid grid-cols-2 gap-4 mb-6 max-h-60 overflow-y-auto">
                                        {filteredEmployees.length > 0 ? (
                                            filteredEmployees.map(emp => (
                                                <motion.button
                                                    key={emp.id}
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleEmployeeSelect(emp)}
                                                    className="p-4 rounded-2xl border-2 border-slate-200 hover:border-cyan-500 hover:bg-cyan-50 transition-all group"
                                                >
                                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-2">
                                                        {emp.name.charAt(0)}
                                                    </div>
                                                    <p className="font-bold text-slate-800 text-xs truncate">{emp.name}</p>
                                                    <p className="text-[10px] text-slate-400 truncate">{emp.job_title}</p>
                                                </motion.button>
                                            ))
                                        ) : (
                                            <div className="col-span-2 text-center py-8 text-slate-400">
                                                <p>No hay usuarios disponibles</p>
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
                                        <input type="text" className="hidden" readOnly value={selectedEmployee?.rut || ''} />
                                        <div>
                                            <label className="block text-center text-sm font-bold text-slate-600 mb-2">
                                                Ingresa tu PIN
                                            </label>
                                            <motion.input
                                                key={error}
                                                animate={error ? { x: [-10, 10, -10, 10, 0] } : {}}
                                                type="password"
                                                maxLength={4}
                                                className={`w-full text-center text-4xl tracking-[1em] font-bold py-4 border-b-4 ${error ? 'border-red-500' : 'border-slate-200'} focus:border-cyan-600 focus:outline-none transition-colors text-slate-800`}
                                                placeholder="••••"
                                                value={pin}
                                                onChange={(e) => { setPin(e.target.value); setError(''); }}
                                                autoFocus
                                            />
                                        </div>
                                        {error && <p className="text-red-500 text-center font-medium">{error}</p>}
                                        <div className="grid grid-cols-2 gap-4">
                                            <button type="button" onClick={handleBack} className="py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Atrás</button>
                                            <button type="submit" disabled={pin.length < 4} className="py-3 rounded-xl font-bold bg-cyan-600 text-white hover:bg-cyan-700 shadow-lg shadow-cyan-200 disabled:opacity-50">Ingresar</button>
                                        </div>
                                    </form>
                                </>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default DashboardPage;
