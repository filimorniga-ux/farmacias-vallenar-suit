import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
    LayoutDashboard, ShoppingCart, Users, Settings, LogOut, X, Menu,
    Package, BarChart3, Truck, UserCircle, Clock, Building2, MapPin, Wrench
} from 'lucide-react';
import { usePharmaStore } from '../store/useStore';
import LocationSelector from '../components/layout/LocationSelector';
import NotificationCenter from '../components/ui/NotificationCenter';
import BottomNavigation from '../components/layout/BottomNavigation';
import AppIcon, { AppThemeColor } from '../components/ui/AppIcon';

const SidebarLayout = ({ children }: { children: React.ReactNode }) => {
    const { user, logout } = usePharmaStore();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    const menuItems = [
        { icon: LayoutDashboard, label: 'Resumen General', path: '/dashboard', roles: ['MANAGER'], color: 'indigo' as AppThemeColor },
        { icon: ShoppingCart, label: 'Punto de Venta', path: '/pos', roles: ['CASHIER', 'QF', 'MANAGER'], color: 'emerald' as AppThemeColor },
        { icon: Package, label: 'Inventario', path: '/inventory', roles: ['WAREHOUSE', 'MANAGER', 'QF'], color: 'cyan' as AppThemeColor },

        { icon: Truck, label: 'Operaciones WMS', path: '/warehouse', roles: ['WAREHOUSE', 'MANAGER', 'QF'], color: 'amber' as AppThemeColor },
        { icon: Building2, label: 'Proveedores', path: '/suppliers', roles: ['MANAGER', 'QF', 'WAREHOUSE'], color: 'blue' as AppThemeColor },
        { icon: BarChart3, label: 'Reportes & BI', path: '/reports', roles: ['MANAGER', 'QF'], color: 'purple' as AppThemeColor },
        { icon: Truck, label: 'Abastecimiento', path: '/supply-chain', roles: ['WAREHOUSE', 'MANAGER'], color: 'orange' as AppThemeColor },
        { icon: UserCircle, label: 'Clientes (CRM)', path: '/clients', roles: ['MANAGER', 'QF', 'CASHIER'], color: 'teal' as AppThemeColor },
        { icon: Users, label: 'Recursos Humanos', path: '/hr', roles: ['MANAGER'], color: 'rose' as AppThemeColor },
        { icon: MapPin, label: 'Gestión de Red', path: '/network', roles: ['MANAGER'], color: 'slate' as AppThemeColor },
        { icon: Clock, label: 'Control Asistencia', path: '/access', roles: ['MANAGER'], color: 'sky' as AppThemeColor },
        { icon: Settings, label: 'Configuración', path: '/settings', roles: ['MANAGER'], color: 'gray' as AppThemeColor },
    ];

    const filteredMenu = menuItems.filter(item => user && item.roles.includes(user.role));

    return (
        <div className="flex h-screen bg-slate-50 overflow-hidden">
            {/* Mobile Backdrop */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm"
                    />
                )}
            </AnimatePresence>

            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-100 transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 shadow-2xl md:shadow-none`}>
                <div className="p-6 flex justify-between items-center mb-2">
                    <div>
                        <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
                            Farmacias <span className="text-cyan-600">Vallenar</span>
                        </h1>
                        <p className="text-[10px] uppercase font-bold text-slate-400 mt-1 tracking-wider">Suit Enterprise v2.1</p>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>

                <nav className="px-4 space-y-1.5 overflow-y-auto max-h-[calc(100vh-180px)] scrollbar-hide pb-4">
                    {filteredMenu.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 group ${isActive
                                    ? 'bg-slate-50 border border-slate-100 shadow-sm'
                                    : 'hover:bg-slate-50 border border-transparent'
                                    }`}
                            >
                                <AppIcon
                                    icon={item.icon}
                                    color={item.color}
                                    variant={isActive ? 'solid' : 'glass'}
                                    size="md"
                                    withGlow={isActive}
                                />
                                <span className={`font-bold text-sm ${isActive ? 'text-slate-900' : 'text-slate-500 group-hover:text-slate-700'}`}>
                                    {item.label}
                                </span>
                                {isActive && (
                                    <motion.div
                                        layoutId="active-pill"
                                        className={`ml-auto w-1.5 h-1.5 rounded-full bg-${item.color}-500`}
                                    />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                <div className="absolute bottom-0 left-0 w-full p-4 bg-white border-t border-slate-100">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-cyan-200">
                            {user?.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold text-slate-800 truncate">{user?.name}</p>
                            <p className="text-xs text-slate-400 truncate font-medium">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-600 transition-colors text-xs font-bold uppercase tracking-wider"
                    >
                        <LogOut size={16} /> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative pb-20 md:pb-0 bg-slate-50/50">
                {/* Mobile Header */}
                <header className="md:hidden bg-white p-4 shadow-sm flex justify-between items-center z-40 border-b border-slate-100 sticky top-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-full transition-colors">
                            <Menu size={24} />
                        </button>
                        <span className="font-bold text-slate-800">Farmacias Vallenar</span>
                    </div>
                    <LocationSelector />
                </header>

                {/* Desktop Header with Location Selector */}
                <header className="hidden md:flex bg-white/80 backdrop-blur-md px-8 py-4 border-b border-slate-100 justify-end items-center z-40 gap-4">
                    <NotificationCenter />
                    <LocationSelector />
                </header>

                <div className="flex-1 overflow-auto p-4 md:p-8">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="h-full max-w-7xl mx-auto"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Mobile Bottom Navigation */}
                <BottomNavigation onMenuClick={() => setIsMobileMenuOpen(true)} />
            </main>
        </div>
    );
};

export default SidebarLayout;
