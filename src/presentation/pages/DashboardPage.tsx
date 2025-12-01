import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePharmaStore } from '../store/useStore';
import { useLocationStore } from '../store/useLocationStore';
import {
    ShoppingCart, Truck, Users, Clock, Lock, ArrowRight, BarChart3, Building2,
    TrendingUp, Wallet, CreditCard, ArrowDownRight, RefreshCw, MapPin, AlertTriangle, Snowflake
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

        const todayExpenses = expenses.filter(e => e.date >= startOfDay).reduce((sum, e) => sum + e.amount, 0);

        // Theoretical Cash in Drawer (Simplified: Sales - Expenses)
        // In a real app, we'd add Initial Fund
        const cashInDrawer = cashSales - todayExpenses;

        // 2. Staff On Duty
        // Filter employees who have checked in today and not checked out
        const activeStaff = employees.filter(emp => {
            // Mock logic: status is stored in employee profile for simplicity in this demo
            return emp.current_status === 'IN' || emp.current_status === 'LUNCH';
        });

        // 3. Alerts
        const lowStockItems = inventory.filter(i => i.stock_actual <= (i.stock_min || 5)).length;
        const fridgeAlerts = inventory.filter(i => i.storage_condition === 'REFRIGERADO' && i.stock_actual > 0).length; // Just a count for now

        return {
            totalSales,
            cashInDrawer,
            cardSales,
            transferSales,
            todayExpenses,
            activeStaff,
            lowStockItems,
            fridgeAlerts
        };
    }, [salesHistory, expenses, employees, inventory, currentLocation]); // Re-calc when data or location changes

    // --- HANDLERS ---

    const handleRefresh = () => {
        setIsRefreshing(true);
        setTimeout(() => setIsRefreshing(false), 1500); // Simulate network request
    };

    const handleLocationSwitch = (locId: string) => {
        switchLocation(locId);
    };

    // --- NAVIGATION & LOGIN LOGIC (Legacy) ---
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

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmployee) return;
        if (login(selectedEmployee.id, pin)) {
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

    const StatCard = ({ title, value, subtext, icon: Icon, color, trend }: any) => (
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between h-full relative overflow-hidden">
            <div className={`absolute top-0 right-0 p-3 opacity-5 ${color}`}>
                <Icon size={64} />
            </div>
            <div className="flex justify-between items-start mb-2">
                <div className={`p-2 rounded-xl ${color} bg-opacity-10 text-${color.split('-')[1]}-600`}>
                    <Icon size={20} className={color.replace('bg-', 'text-')} />
                </div>
                {trend && (
                    <span className="text-xs font-bold text-green-600 flex items-center bg-green-50 px-2 py-1 rounded-full">
                        <TrendingUp size={12} className="mr-1" /> {trend}
                    </span>
                )}
            </div>
            <div>
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">{title}</p>
                <h3 className="text-2xl font-extrabold text-slate-800 mt-1">{value}</h3>
                {subtext && <p className="text-slate-400 text-xs mt-1">{subtext}</p>}
            </div>
        </div>
    );

    const ModuleCard = ({ title, icon: Icon, color, route }: any) => (
        <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => handleCardClick(route)}
            className="flex flex-col items-center justify-center p-4 bg-white rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all h-24"
        >
            <div className={`${color} p-2 rounded-full text-white mb-2 shadow-sm`}>
                <Icon size={20} />
            </div>
            <span className="text-xs font-bold text-slate-700 text-center leading-tight">{title}</span>
        </motion.button>
    );

    return (
        <div className="min-h-screen bg-slate-50 pb-20">
            {/* --- HEADER (Mobile Optimized) --- */}
            <header className="bg-white sticky top-0 z-30 px-6 py-4 shadow-sm border-b border-slate-100">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-xl font-extrabold text-slate-900">
                            Farmacias <span className="text-cyan-600">Vallenar</span>
                        </h1>
                        <p className="text-xs text-slate-500 font-medium flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                            Operación en Tiempo Real
                        </p>
                    </div>
                    <button
                        onClick={handleRefresh}
                        className={`p-2 rounded-full bg-slate-50 text-slate-400 hover:text-cyan-600 transition-colors ${isRefreshing ? 'animate-spin' : ''}`}
                    >
                        <RefreshCw size={20} />
                    </button>
                </div>

                {/* Branch Selector */}
                <div className="overflow-x-auto pb-2 -mx-6 px-6 scrollbar-hide">
                    <div className="flex gap-3">
                        {locations.map(loc => (
                            <button
                                key={loc.id}
                                onClick={() => handleLocationSwitch(loc.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all ${currentLocation?.id === loc.id
                                    ? 'bg-slate-900 text-white shadow-lg shadow-slate-200'
                                    : 'bg-white border border-slate-200 text-slate-600'
                                    }`}
                            >
                                <MapPin size={14} />
                                {loc.name}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            <main className="p-6 space-y-8 max-w-md mx-auto md:max-w-4xl">

                {/* --- SECTION 1: FINANCIAL PULSE --- */}
                <section>
                    <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Pulso Financiero (Hoy)</h2>
                    <div className="grid grid-cols-2 gap-4">
                        {/* 1. Venta Total */}
                        <div className="col-span-2">
                            <StatCard
                                title="Venta Total"
                                value={`$${dashboardData.totalSales.toLocaleString()}`}
                                subtext="Objetivo Diario: $2.5M"
                                icon={TrendingUp}
                                color="bg-green-500"
                                trend="+12%"
                            />
                        </div>

                        {/* 2. Efectivo Caja */}
                        <StatCard
                            title="Efectivo Caja"
                            value={`$${dashboardData.cashInDrawer.toLocaleString()}`}
                            icon={Wallet}
                            color="bg-emerald-500"
                        />

                        {/* 3. Tarjetas (POS) */}
                        <StatCard
                            title="Tarjetas (POS)"
                            value={`$${dashboardData.cardSales.toLocaleString()}`}
                            icon={CreditCard}
                            color="bg-blue-500"
                        />

                        {/* 4. Transferencias */}
                        <StatCard
                            title="Transferencias"
                            value={`$${dashboardData.transferSales.toLocaleString()}`}
                            icon={ArrowRight} // Or Smartphone if imported
                            color="bg-purple-500"
                        />

                        {/* 5. Salidas / Gastos */}
                        <div className="bg-red-50 rounded-2xl p-5 flex flex-col justify-between border border-red-100 h-full relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-5 text-red-600">
                                <ArrowDownRight size={64} />
                            </div>
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 rounded-xl bg-red-100 text-red-600">
                                    <ArrowDownRight size={20} />
                                </div>
                            </div>
                            <div>
                                <p className="text-red-400 text-xs font-bold uppercase tracking-wider">Salidas / Gastos</p>
                                <h3 className="text-2xl font-extrabold text-red-700 mt-1">${dashboardData.todayExpenses.toLocaleString()}</h3>
                            </div>
                        </div>
                    </div>
                </section>

                {/* --- SECTION 2: STAFF MONITOR --- */}
                <section>
                    <div className="flex justify-between items-end mb-4">
                        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Equipo en Pista</h2>
                        <span className="text-xs font-bold text-cyan-600 bg-cyan-50 px-2 py-1 rounded-md">
                            {dashboardData.activeStaff.length} Activos
                        </span>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-4 -mx-6 px-6 scrollbar-hide">
                        {dashboardData.activeStaff.length > 0 ? (
                            dashboardData.activeStaff.map(emp => (
                                <div key={emp.id} className="min-w-[140px] bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-col items-center text-center relative">
                                    <div className={`absolute top-3 right-3 w-3 h-3 rounded-full border-2 border-white ${emp.current_status === 'LUNCH' ? 'bg-yellow-400' : 'bg-green-500'
                                        }`}></div>
                                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 mb-3 flex items-center justify-center text-xl font-bold text-slate-600">
                                        {emp.name.charAt(0)}
                                    </div>
                                    <p className="text-sm font-bold text-slate-800 truncate w-full">{emp.name.split(' ')[0]}</p>
                                    <p className="text-[10px] text-slate-400 font-medium uppercase mb-2">{emp.job_title}</p>

                                    <div className={`text-[10px] font-bold px-2 py-1 rounded-full ${emp.current_status === 'LUNCH' ? 'bg-yellow-50 text-yellow-700' : 'bg-green-50 text-green-700'
                                        }`}>
                                        {emp.current_status === 'LUNCH' ? 'COLACIÓN' : 'EN TURNO'}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="w-full text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-400 text-sm">
                                No hay personal registrado en turno
                            </div>
                        )}
                    </div>
                </section>

                {/* --- SECTION 3: ALERTS --- */}
                {(dashboardData.lowStockItems > 0 || dashboardData.fridgeAlerts > 0) && (
                    <section>
                        <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Alertas Operativas</h2>
                        <div className="space-y-3">
                            {dashboardData.lowStockItems > 0 && (
                                <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-center gap-3">
                                    <AlertTriangle className="text-orange-500" size={20} />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-orange-800">Stock Crítico</p>
                                        <p className="text-xs text-orange-600">{dashboardData.lowStockItems} productos requieren reposición urgente.</p>
                                    </div>
                                </div>
                            )}
                            {dashboardData.fridgeAlerts > 0 && (
                                <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center gap-3">
                                    <Snowflake className="text-blue-500" size={20} />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-blue-800">Cadena de Frío</p>
                                        <p className="text-xs text-blue-600">Monitoreando {dashboardData.fridgeAlerts} productos refrigerados.</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {/* --- SECTION 4: QUICK ACCESS (MODULES) --- */}
                <section>
                    <h2 className="text-sm font-bold text-slate-400 mb-4 uppercase tracking-wider">Módulos de Sistema</h2>
                    <div className="grid grid-cols-4 gap-3">
                        <ModuleCard title="Ventas" icon={ShoppingCart} color="bg-emerald-500" route="/pos" />
                        <ModuleCard title="Bodega" icon={Truck} color="bg-orange-500" route="/warehouse" />
                        <ModuleCard title="Admin" icon={Building2} color="bg-blue-500" route="/settings" />
                        <ModuleCard title="Reportes" icon={BarChart3} color="bg-purple-600" route="/reports" />
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

            {/* Login Modal (Reused) */}
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
