import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useLocationStore } from '../../store/useLocationStore';
import { usePharmaStore } from '../../store/useStore';
import { MapPin, Building2, Warehouse, ChevronDown, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getLocationIcon = (type: string) => {
    switch (type) {
        case 'WAREHOUSE':
            return Warehouse;
        case 'STORE':
            return Building2;
        default:
            return MapPin;
    }
};

const getLocationColor = (type: string) => {
    switch (type) {
        case 'WAREHOUSE':
            return 'from-amber-500 to-orange-600';
        case 'STORE':
            return 'from-blue-600 to-indigo-600';
        default:
            return 'from-gray-500 to-gray-600';
    }
};



const LocationSwitcher: React.FC = () => {
    const { currentLocation, locations, switchLocation, canSwitchLocation } = useLocationStore();
    const { user, setCurrentLocation } = usePharmaStore();
    const [isOpen, setIsOpen] = useState(false);
    const [isSwitching, setIsSwitching] = useState(false);
    const router = useRouter();
    const queryClient = useQueryClient();

    const canSwitch = user ? canSwitchLocation(user.role) : false;

    // Functions moved outside are cleaner, but if inside, they are recreated.
    // Moving them out or using useCallback is better.
    // Since they don't depend on state/props, moving out is best.


    const handleLocationSwitch = (locationId: string) => {
        if (!canSwitch) return;
        setIsSwitching(true);
        setIsOpen(false);

        // 1. Find Target Location
        const target = locations.find(l => l.id === locationId);
        if (!target) return;

        // Breve delay solo para mostrar la animación de transición
        setTimeout(() => {
            // 2. Update Location Store (Persisted)
            switchLocation(locationId, () => {
                // 3. Update Pharma Store (Persisted & Actions Context)
                const warehouseId = target.default_warehouse_id || target.id;
                setCurrentLocation(target.id, warehouseId, '');

                // 4. Invalidar caché de React Query para forzar recarga de datos frescos
                queryClient.invalidateQueries({ queryKey: ['inventory'] });
                queryClient.invalidateQueries({ queryKey: ['sales'] });
                queryClient.invalidateQueries({ queryKey: ['procurement'] });

                // 5. Navegar al inicio para refrescar contexto sin recargar toda la app
                console.log('🔄 Sucursal cambiada a:', target.name);
                setIsSwitching(false);
                router.push('/');
                router.refresh();
            });
        }, 150);
    };

    // If no location, we show a "Select" button if the user can switch
    if (!currentLocation) {
        if (!canSwitch) return null; // If they can't switch and have no location, they shouldn't even be here, but let's be safe.

        return (
            <div className="relative">
                <button
                    onClick={() => !isSwitching && setIsOpen(!isOpen)}
                    className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-600 transition-all hover:bg-blue-100 animate-pulse shadow-sm min-w-[180px]"
                >
                    <MapPin className="w-5 h-5" />
                    <div className="text-left">
                        <div className="text-[10px] font-bold uppercase tracking-wider">Contexto Requerido</div>
                        <div className="text-sm font-extrabold leading-tight">Seleccionar Sucursal</div>
                    </div>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} ml-auto`} />
                </button>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            className="absolute top-full right-0 mt-3 w-[min(88vw,20rem)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 ring-4 ring-black/5"
                        >
                            <div className="bg-slate-50 px-4 py-4 border-b border-gray-100">
                                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                    <MapPin className="w-4 h-4 text-slate-500" />
                                    Seleccionar Ubicación
                                </h3>
                            </div>
                            <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
                                {locations.filter(l => l.is_active !== false).map((loc) => (
                                    <button
                                        key={loc.id}
                                        onClick={() => handleLocationSwitch(loc.id)}
                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-all rounded-lg group border border-transparent hover:border-gray-200"
                                    >
                                        <div className={`p-2 rounded-lg bg-gradient-to-br ${getLocationColor(loc.type)} shadow-sm group-hover:scale-110 transition-transform`}>
                                            <Building2 className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <span className="text-sm font-bold text-gray-900">{loc.name}</span>
                                            <div className="text-xs text-slate-500 font-medium">
                                                {loc.type === 'WAREHOUSE' ? 'Bodega' : 'Sucursal'}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        );
    }




    return (
        <div className="relative">
            {/* Transition Overlay */}
            <AnimatePresence>
                {isSwitching && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-md flex items-center justify-center p-4 transition-all"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 10 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 10 }}
                            className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full text-center border border-white/40 ring-1 ring-black/5"
                        >
                            <motion.div
                                animate={{
                                    rotate: [0, 360],
                                    scale: [1, 1.1, 1]
                                }}
                                transition={{
                                    rotate: { duration: 2, repeat: Infinity, ease: "linear" },
                                    scale: { duration: 1, repeat: Infinity }
                                }}
                                className="w-16 h-16 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-cyan-200"
                            >
                                <Building2 size={32} className="text-white" />
                            </motion.div>

                            <h2 className="text-2xl font-black text-slate-800 mb-2 tracking-tight">Cambiando Sucursal</h2>
                            <p className="text-slate-500 font-medium">Sincronizando inventario y reportes...</p>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Current Location Button */}
            <div className="flex flex-col items-end mr-2 lg:hidden [@media(max-height:520px)]:hidden">
                <span className="text-[10px] uppercase font-bold text-slate-400">Ubicación Actual</span>
            </div>

            <button
                onClick={() => canSwitch && !isSwitching && setIsOpen(!isOpen)}
                disabled={!canSwitch || isSwitching}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border transition-all group relative overflow-hidden max-w-[min(76vw,22rem)] ${canSwitch
                    ? 'hover:shadow-md cursor-pointer hover:border-cyan-300'
                    : 'opacity-75 cursor-not-allowed bg-slate-50'
                    } bg-white text-slate-900 border-slate-200 shadow-sm`}
            >
                {/* Shine Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:animate-shine" />

                <div className={`p-1.5 rounded-lg bg-gradient-to-br ${getLocationColor(currentLocation.type)} text-white shadow-sm`}>
                    {React.createElement(getLocationIcon(currentLocation.type), { className: 'w-5 h-5' })}
                </div>

                <div className="text-left min-w-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        {currentLocation.type === 'WAREHOUSE' ? 'Estás en Bodega' : 'Estás en Sucursal'}
                    </div>
                    <div className="text-sm font-extrabold leading-tight text-slate-800 truncate">
                        {currentLocation.name.replace('Farmacia Vallenar ', '').replace('Bodega General ', '')}
                    </div>
                </div>

                {canSwitch ? (
                    <div className="pl-2 border-l border-slate-100 ml-1">
                        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''} text-slate-400`} />
                    </div>
                ) : (
                    <div className="pl-2 border-l border-slate-100 ml-1">
                        <Lock className="w-4 h-4 text-slate-300" />
                    </div>
                )}
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && canSwitch && (
                    <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full right-0 mt-3 w-[min(88vw,20rem)] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50 ring-4 ring-black/5"
                    >
                        {/* Header */}
                        <div className="bg-slate-50 px-4 py-4 border-b border-gray-100">
                            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-slate-500" />
                                Seleccionar Ubicación
                            </h3>
                        </div>

                        {/* Locations List */}
                        <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
                            {locations.filter(l => l.is_active !== false).map((location) => {
                                const LocationIcon = getLocationIcon(location.type);
                                const isActive = location.id === currentLocation?.id;

                                return (
                                    <button
                                        key={location.id}
                                        onClick={() => handleLocationSwitch(location.id)}
                                        className={`w-full px-4 py-3 flex items-center gap-3 transition-all rounded-lg group ${isActive
                                            ? 'bg-blue-50 border border-blue-200 shadow-sm'
                                            : 'hover:bg-gray-50 border border-transparent hover:border-gray-200'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-lg bg-gradient-to-br ${getLocationColor(location.type)} shadow-sm group-hover:scale-110 transition-transform`}>
                                            <LocationIcon className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center justify-between">
                                                <span className={`text-sm font-bold ${isActive ? 'text-blue-900' : 'text-gray-900'
                                                    }`}>
                                                    {location.name}
                                                </span>
                                                {isActive && (
                                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className="text-xs text-slate-500 font-medium">
                                                    {location.type === 'WAREHOUSE' ? 'Bodega' : 'Sucursal'}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Locked Message */}
            {!canSwitch && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-slate-800 text-white rounded-xl p-4 text-xs shadow-xl z-50 hidden group-hover:block transition-all">
                    <div className="flex items-start gap-3">
                        <Lock className="w-5 h-5 text-white/50 shrink-0" />
                        <div>
                            <p className="font-bold text-white mb-1">Acceso Restringido</p>
                            <p className="text-slate-300 leading-relaxed">
                                Tu perfil de <strong>{user?.role}</strong> está vinculado a esta sucursal específica.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocationSwitcher;
