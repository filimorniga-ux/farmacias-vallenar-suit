'use client';
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { LayoutDashboard, ShoppingCart, Users, Settings, LogOut, Menu, X, Stethoscope, Package, Briefcase, BarChart3, Truck, UserCircle, Clock, Building2, MapPin } from 'lucide-react';
import { usePharmaStore } from './presentation/store/useStore';
import { Toaster } from 'sonner';

// Components
import LocationSelector from './presentation/components/layout/LocationSelector';
import NotificationCenter from './presentation/components/ui/NotificationCenter';

// Pages
import LandingPage from './presentation/pages/LandingPage';
import DashboardPage from './presentation/pages/DashboardPage';
import POSMainScreen from './presentation/components/POSMainScreen';
import SupplyChainPage from './presentation/pages/SupplyChainPage';
import QueueKioskPage from './presentation/pages/QueueKioskPage';
import AccessControlPage from './presentation/pages/AccessControlPage';
import HRPage from './presentation/pages/HRPage';
import SettingsPage from './presentation/pages/SettingsPage';
import ClientsPage from './presentation/pages/ClientsPage';
import InventoryPage from './presentation/pages/InventoryPage';
import ReportsPage from './presentation/pages/ReportsPage';
import AttendanceKioskPage from './presentation/pages/AttendanceKioskPage';
import { WarehouseOps } from './presentation/pages/WarehouseOps';
import { SuppliersPage } from './presentation/pages/SuppliersPage';
import { SupplierProfile } from './presentation/pages/SupplierProfile';
import NetworkPage from './presentation/pages/NetworkPage';
import PriceCheckPage from './presentation/pages/PriceCheckPage';

const SidebarLayout = ({ children }: { children: React.ReactNode }) => {
    const { user, logout } = usePharmaStore();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

    const menuItems = [
        // { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: ['MANAGER', 'QF'] }, // Removed per user request
        { icon: ShoppingCart, label: 'Punto de Venta', path: '/pos', roles: ['CASHIER', 'QF', 'MANAGER'] },
        { icon: Package, label: 'Inventario', path: '/inventory', roles: ['WAREHOUSE', 'MANAGER', 'QF'] },
        { icon: Truck, label: 'Operaciones WMS', path: '/warehouse', roles: ['WAREHOUSE', 'MANAGER', 'QF'] },
        { icon: Building2, label: 'Proveedores', path: '/suppliers', roles: ['MANAGER', 'QF', 'WAREHOUSE'] },
        { icon: BarChart3, label: 'Reportes & BI', path: '/reports', roles: ['MANAGER', 'QF'] },
        { icon: Truck, label: 'Abastecimiento', path: '/supply-chain', roles: ['WAREHOUSE', 'MANAGER'] },
        { icon: UserCircle, label: 'Clientes (CRM)', path: '/clients', roles: ['MANAGER', 'QF', 'CASHIER'] },
        { icon: Users, label: 'Recursos Humanos', path: '/hr', roles: ['MANAGER'] },
        { icon: MapPin, label: 'Gestión de Red', path: '/network', roles: ['MANAGER'] },
        { icon: Clock, label: 'Control Asistencia', path: '/access', roles: ['MANAGER'] },
        { icon: Settings, label: 'Configuración', path: '/settings', roles: ['MANAGER'] },
    ];

    const filteredMenu = menuItems.filter(item => user && item.roles.includes(user.role));

    return (
        <div className="flex h-screen bg-slate-100 overflow-hidden">
            {/* Sidebar */}
            <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 shadow-2xl`}>
                <div className="p-6 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
                            Farmacias Vallenar
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">Sistema ERP Clínico Integral v2.1</p>
                    </div>
                    <button onClick={() => setIsMobileMenuOpen(false)} className="md:hidden text-slate-400 hover:text-white">
                        <X size={24} />
                    </button>
                </div>

                <nav className="mt-6 px-4 space-y-2">
                    {filteredMenu.map((item) => (
                        <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${location.pathname === item.path ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-900/50' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
                        >
                            <item.icon size={20} />
                            <span className="font-medium">{item.label}</span>
                        </Link>
                    ))}
                </nav>

                <div className="absolute bottom-0 left-0 w-full p-4 bg-slate-950">
                    <div className="flex items-center gap-3 mb-4 px-2">
                        <div className="w-10 h-10 rounded-full bg-cyan-900 flex items-center justify-center text-cyan-400 font-bold border border-cyan-700">
                            {user?.name.charAt(0)}
                        </div>
                        <div className="overflow-hidden">
                            <p className="text-sm font-bold text-white truncate">{user?.name}</p>
                            <p className="text-xs text-slate-500 truncate">{user?.role}</p>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-colors text-sm font-bold"
                    >
                        <LogOut size={16} /> Cerrar Sesión
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Mobile Header */}
                <header className="md:hidden bg-white p-4 shadow-sm flex justify-between items-center z-40">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="text-slate-600">
                        <Menu size={24} />
                    </button>
                    <span className="font-bold text-slate-800">Farmacias Vallenar</span>
                    <LocationSelector />
                </header>

                {/* Desktop Header with Location Selector */}
                <header className="hidden md:flex bg-white px-6 py-3 shadow-sm justify-end items-center z-40 gap-4">
                    <NotificationCenter />
                    <LocationSelector />
                </header>

                <div className="flex-1 overflow-auto">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className="h-full"
                        >
                            {children}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </main>
        </div>
    );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const { user } = usePharmaStore();
    if (!user) return <Navigate to="/" replace />;
    return <SidebarLayout>{children}</SidebarLayout>;
};

const App: React.FC = () => {
    const { syncData } = usePharmaStore();

    useEffect(() => {
        syncData();
    }, []);

    return (
        <BrowserRouter>
            <Toaster position="top-center" richColors />
            <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/kiosk" element={<AttendanceKioskPage />} />
                <Route path="/access" element={<AccessControlPage />} />
                <Route path="/queue" element={<QueueKioskPage />} />
                <Route path="/price-check" element={<PriceCheckPage />} />

                {/* Protected Routes */}
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/pos" element={<ProtectedRoute><POSMainScreen /></ProtectedRoute>} />
                <Route path="/inventory" element={<ProtectedRoute><InventoryPage /></ProtectedRoute>} />
                <Route path="/warehouse" element={<ProtectedRoute><WarehouseOps /></ProtectedRoute>} />
                <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
                <Route path="/suppliers/:id" element={<ProtectedRoute><SupplierProfile /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
                <Route path="/supply-chain" element={<ProtectedRoute><SupplyChainPage /></ProtectedRoute>} />
                <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
                <Route path="/hr" element={<ProtectedRoute><HRPage /></ProtectedRoute>} />
                <Route path="/network" element={<ProtectedRoute><NetworkPage /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/admin" element={<Navigate to="/dashboard" replace />} />

                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
};

export default App;
