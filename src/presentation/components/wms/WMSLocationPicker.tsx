/**
 * WMSLocationPicker - Selector de sucursal/bodega para operaciones WMS
 * 
 * Muestra Origen → Destino para transferencias, o solo destino para despachos.
 * Obtiene las ubicaciones del backend via getWarehousesSecure.
 */
import React, { useState, useEffect } from 'react';
import { MapPin, ArrowRight, Building2, Warehouse, Loader2 } from 'lucide-react';
import { getWarehousesSecure } from '@/actions/locations-v2';
import { Location } from '@/domain/types';

type PickerMode = 'destination' | 'origin' | 'both';

interface WMSLocationPickerProps {
    /** Modo del picker */
    mode: PickerMode;
    /** ID de la ubicación actual (excluida del destino) */
    currentLocationId: string;
    /** Nombre de la ubicación actual */
    currentLocationName?: string;
    /** Callback cuando se selecciona destino */
    onDestinationChange: (locationId: string, locationName: string) => void;
    /** Callback cuando se selecciona origen (modo 'both' o 'origin') */
    onOriginChange?: (locationId: string, locationName: string) => void;
    /** Destino seleccionado */
    selectedDestination?: string;
    /** Origen seleccionado */
    selectedOrigin?: string;
    /** Deshabilitar */
    disabled?: boolean;
}

export const WMSLocationPicker: React.FC<WMSLocationPickerProps> = ({
    mode,
    currentLocationId,
    currentLocationName = 'Ubicación Actual',
    onDestinationChange,
    onOriginChange,
    selectedDestination = '',
    selectedOrigin = '',
    disabled = false,
}) => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        setLoading(true);

        getWarehousesSecure().then((res) => {
            if (mounted && res.success && res.data) {
                setLocations(res.data);
            }
            if (mounted) setLoading(false);
        }).catch(() => {
            if (mounted) setLoading(false);
        });

        return () => { mounted = false; };
    }, []);

    // Ubicaciones disponibles para cada rol (excluir actual)
    const destinationOptions = locations.filter(l => l.id !== currentLocationId && l.id !== selectedOrigin);
    const originOptions = locations.filter(l => l.id !== selectedDestination);

    const handleDestinationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const loc = locations.find(l => l.id === e.target.value);
        if (loc) onDestinationChange(loc.id, loc.name);
    };

    const handleOriginSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const loc = locations.find(l => l.id === e.target.value);
        if (loc && onOriginChange) onOriginChange(loc.id, loc.name);
    };

    const selectClass = `w-full p-3 bg-white border-2 border-slate-200 rounded-xl 
                         font-medium text-slate-800
                         focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                         disabled:bg-slate-50 disabled:text-slate-400
                         transition-all duration-200 outline-none appearance-none
                         cursor-pointer`;

    const iconColor = (type: string) => {
        return type === 'STORE' ? 'text-sky-500' : type === 'WAREHOUSE' ? 'text-amber-500' : 'text-purple-500';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-6 text-slate-400 gap-2">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Cargando ubicaciones...</span>
            </div>
        );
    }

    // Modo simple: solo destino (para Despacho)
    if (mode === 'destination') {
        return (
            <div className="space-y-3">
                {/* Origen fijo */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-sky-500" />
                        <span className="text-xs font-semibold text-slate-500 uppercase">Origen</span>
                    </div>
                    <p className="font-bold text-slate-800 mt-1">{currentLocationName}</p>
                    <p className="text-xs text-slate-400">Ubicación actual de sesión</p>
                </div>

                {/* Destino seleccionable */}
                <div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase mb-1.5">
                        <Building2 size={14} />
                        Destino
                    </label>
                    <select
                        value={selectedDestination}
                        onChange={handleDestinationSelect}
                        disabled={disabled}
                        className={selectClass}
                    >
                        <option value="">Seleccionar destino...</option>
                        {destinationOptions.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} ({loc.type === 'STORE' ? 'Sucursal' : loc.type === 'WAREHOUSE' ? 'Bodega' : 'Central'})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    // Modo 'both': Origen ↔ Destino (para Transferencias)
    return (
        <div className="space-y-3">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                {/* Origen */}
                <div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase mb-1.5">
                        <Warehouse size={14} className="text-amber-500" />
                        Origen
                    </label>
                    <select
                        value={selectedOrigin || currentLocationId}
                        onChange={handleOriginSelect}
                        disabled={disabled}
                        className={selectClass}
                    >
                        {/* Incluir current como opción por defecto */}
                        {originOptions.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} {loc.id === currentLocationId ? '(Actual)' : ''}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Flecha */}
                <div className="pb-3">
                    <ArrowRight size={20} className="text-slate-400" />
                </div>

                {/* Destino */}
                <div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase mb-1.5">
                        <Building2 size={14} className="text-sky-500" />
                        Destino
                    </label>
                    <select
                        value={selectedDestination}
                        onChange={handleDestinationSelect}
                        disabled={disabled}
                        className={selectClass}
                    >
                        <option value="">Seleccionar destino...</option>
                        {destinationOptions.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} ({loc.type === 'STORE' ? 'Sucursal' : loc.type === 'WAREHOUSE' ? 'Bodega' : 'Central'})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default WMSLocationPicker;
