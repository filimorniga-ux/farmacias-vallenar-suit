import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useLocationStore } from '../store/useLocationStore';
import { usePharmaStore } from '../store/useStore';
import { motion } from 'framer-motion';
import { MapPin, Building2, Warehouse, ArrowRight, LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

const ContextSelectionPage: React.FC = () => {
    const navigate = useNavigate();
    const locationState = useLocation().state as { targetRoute?: string } | null;
    const { user, logout, setCurrentLocation } = usePharmaStore();
    const { locations, switchLocation } = useLocationStore();
    const [isSelecting, setIsSelecting] = useState(false);

    // Filter locations based on user role
    const availableLocations = React.useMemo(() => {
        if (!user) return [];

        // Managers/Admins see all
        if (['MANAGER', 'ADMIN'].includes(user.role)) {
            return locations;
        }

        // Others see assigned only
        if (user.assigned_location_id) {
            return locations.filter(l => l.id === user.assigned_location_id);
        }

        return [];
    }, [user, locations]);

    // Auto-redirect if single location
    useEffect(() => {
        if (availableLocations.length === 1 && !isSelecting) {
            handleLocationSelect(availableLocations[0].id);
        }
    }, [availableLocations]);

    const handleLocationSelect = (locationId: string) => {
        setIsSelecting(true);
        const target = locations.find(l => l.id === locationId);

        if (!target) {
            setIsSelecting(false);
            return;
        }

        // 1. Update Persistent Store
        switchLocation(locationId, () => {
            // 2. Update Auth/Action Context
            // Resolve default warehouse
            const warehouseId = target.default_warehouse_id || (target.type === 'WAREHOUSE' ? target.id : '');
            setCurrentLocation(target.id, warehouseId, ''); // No terminal selected yet

            // 3. Navigate to Target Route
            const route = locationState?.targetRoute || '/dashboard';
            toast.success(`Bienvenido a ${target.name}`);

            // Force reload if we are not coming from a fresh login to ensure clean state? 
            // For now, simple navigation since we are at root level post-login.
            // Actually, let's force a reload if we want to be 100% sure, but navigation might be smoother.
            // Given the previous requirement of full reload for context switch, let's stick to navigation first 
            // as this is "Entry" point. But if data is stale, reload might be needed.
            // Let's rely on stored state update.
            navigate(route);
        });
    };

    const handleLogout = () => {
        logout();
        navigate('/');
    };

    if (!user) {
        navigate('/');
        return null;
    }

    if (availableLocations.length === 0) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="text-center max-w-md">
                    <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                        <ShieldCheck className="text-red-600 w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 mb-2">Sin Acceso a Sucursales</h2>
                    <p className="text-slate-500 mb-8">Tu usuario no tiene ninguna sucursal asignada. Contacta al administrador.</p>
                    <button onClick={handleLogout} className="px-6 py-3 bg-white border border-slate-300 rounded-xl font-bold text-slate-600 hover:bg-slate-50">
                        Cerrar Sesión
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decoration */}
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-cyan-50 to-slate-50 -z-10" />

            <div className="w-full max-w-4xl z-10">
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-100 mb-4 shadow-sm ring-4 ring-white">
                        <Building2 className="w-8 h-8 text-cyan-600" />
                    </div>
                    <h1 className="text-3xl font-extrabold mb-2 text-slate-900">¡Hola, {user.name.split(' ')[0]}!</h1>
                    <p className="text-slate-500 text-lg font-medium">¿Dónde trabajarás hoy?</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {availableLocations.map((loc, idx) => (
                        <motion.button
                            key={loc.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            onClick={() => handleLocationSelect(loc.id)}
                            disabled={isSelecting}
                            className="bg-white p-6 rounded-2xl shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-cyan-500/10 hover:-translate-y-1 transition-all text-left group border border-slate-100 relative overflow-hidden"
                        >
                            <div className={`absolute top-0 right-0 p-20 opacity-0 group-hover:opacity-10 transition-opacity rounded-full -mr-10 -mt-10 bg-gradient-to-br ${loc.type === 'WAREHOUSE' ? 'from-amber-400 to-orange-600' : 'from-cyan-400 to-blue-600'
                                }`} />

                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-colors ${loc.type === 'WAREHOUSE'
                                ? 'bg-amber-100 text-amber-600 group-hover:bg-amber-500 group-hover:text-white'
                                : 'bg-cyan-100 text-cyan-600 group-hover:bg-cyan-500 group-hover:text-white'
                                }`}>
                                {loc.type === 'WAREHOUSE' ? <Warehouse size={24} /> : <MapPin size={24} />}
                            </div>

                            <h3 className="text-lg font-bold text-slate-800 mb-1 group-hover:text-cyan-700 transition-colors">
                                {loc.name}
                            </h3>
                            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-4">
                                {loc.type === 'WAREHOUSE' ? 'Centro de Distribución' : 'Sucursal Farmacéutica'}
                            </p>

                            <div className="flex items-center text-sm font-bold text-slate-400 group-hover:text-cyan-600 transition-colors">
                                Seleccionar <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
                            </div>
                        </motion.button>
                    ))}
                </div>

                <div className="mt-12 text-center">
                    <button
                        onClick={handleLogout}
                        className="inline-flex items-center text-slate-400 hover:text-slate-600 transition-colors text-sm font-medium"
                    >
                        <LogOut size={16} className="mr-2" />
                        No eres {user.name.split(' ')[0]}? Cerrar Sesión
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ContextSelectionPage;
