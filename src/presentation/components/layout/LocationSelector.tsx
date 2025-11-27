import React, { useState } from 'react';
import { useLocationStore } from '../../store/useLocationStore';
import { usePharmaStore } from '../../store/useStore';
import { MapPin, Building2, Warehouse, ChevronDown, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LocationSelector: React.FC = () => {
    const { currentLocation, locations, switchLocation, canSwitchLocation } = useLocationStore();
    const { user } = usePharmaStore();
    const [isOpen, setIsOpen] = useState(false);

    const canSwitch = user ? canSwitchLocation(user.role) : false;

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
                return 'from-blue-500 to-cyan-600';
            default:
                return 'from-gray-500 to-gray-600';
        }
    };

    const getLocationBadgeColor = (type: string) => {
        switch (type) {
            case 'WAREHOUSE':
                return 'bg-amber-100 text-amber-700 border-amber-300';
            case 'STORE':
                return 'bg-blue-100 text-blue-700 border-blue-300';
            default:
                return 'bg-gray-100 text-gray-700 border-gray-300';
        }
    };

    const handleLocationSwitch = (locationId: string) => {
        if (!canSwitch) return;

        switchLocation(locationId, () => {
            setIsOpen(false);
            // Optionally trigger data refresh here
            // usePharmaStore.getState().syncData();
        });
    };

    if (!currentLocation) return null;

    const Icon = getLocationIcon(currentLocation.type);

    return (
        <div className="relative">
            {/* Current Location Button */}
            <button
                onClick={() => canSwitch && setIsOpen(!isOpen)}
                disabled={!canSwitch}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 transition-all ${canSwitch
                    ? 'hover:shadow-lg cursor-pointer'
                    : 'opacity-75 cursor-not-allowed'
                    } bg-gradient-to-r ${getLocationColor(currentLocation.type)} text-white border-white/20`}
            >
                <Icon className="w-5 h-5" />
                <div className="text-left">
                    <div className="text-xs font-medium opacity-90">
                        {currentLocation.type === 'WAREHOUSE' ? '🏭 BODEGA' : '🏥 SUCURSAL'}
                    </div>
                    <div className="text-sm font-bold">
                        {currentLocation.name.replace('Farmacia Vallenar ', '').replace('Bodega Central ', '')}
                    </div>
                </div>
                {canSwitch ? (
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                ) : (
                    <Lock className="w-4 h-4" />
                )}
            </button>

            {/* Dropdown Menu */}
            <AnimatePresence>
                {isOpen && canSwitch && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200">
                            <div className="flex items-center gap-2">
                                <MapPin className="w-4 h-4 text-gray-600" />
                                <span className="text-sm font-bold text-gray-900">Cambiar Ubicación</span>
                            </div>
                            <p className="text-xs text-gray-600 mt-1">
                                Selecciona la sucursal o bodega que deseas gestionar
                            </p>
                        </div>

                        {/* Locations List */}
                        <div className="max-h-96 overflow-y-auto">
                            {locations.map((location) => {
                                const LocationIcon = getLocationIcon(location.type);
                                const isActive = location.id === currentLocation?.id;

                                return (
                                    <button
                                        key={location.id}
                                        onClick={() => handleLocationSwitch(location.id)}
                                        className={`w-full px-4 py-3 flex items-center gap-3 transition-all ${isActive
                                            ? 'bg-blue-50 border-l-4 border-blue-600'
                                            : 'hover:bg-gray-50 border-l-4 border-transparent'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-lg bg-gradient-to-br ${getLocationColor(location.type)}`}>
                                            <LocationIcon className="w-5 h-5 text-white" />
                                        </div>
                                        <div className="flex-1 text-left">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-bold ${isActive ? 'text-blue-900' : 'text-gray-900'
                                                    }`}>
                                                    {location.name}
                                                </span>
                                                {isActive && (
                                                    <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-bold rounded-full">
                                                        Actual
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getLocationBadgeColor(location.type)
                                                    }`}>
                                                    {location.type === 'WAREHOUSE' ? 'Bodega' : 'Sucursal'}
                                                </span>
                                                <span className="text-xs text-gray-500">
                                                    {location.address}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Footer Info */}
                        <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                                <span>Rol: <span className="font-bold text-gray-900">{user?.role}</span></span>
                                <span className="mx-1">•</span>
                                <span>Acceso: <span className="font-bold text-green-600">Total</span></span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Locked Message for Non-Managers */}
            {!canSwitch && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800 shadow-lg z-50 hidden group-hover:block">
                    <div className="flex items-start gap-2">
                        <Lock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-bold">Ubicación Bloqueada</p>
                            <p className="mt-1">
                                Tu rol ({user?.role}) solo tiene acceso a esta ubicación.
                                Contacta al gerente para cambiar de sucursal.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LocationSelector;
