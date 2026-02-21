/**
 * WMSLocationPicker - Selector de sucursal/bodega para operaciones WMS
 * 
 * Muestra Origen → Destino para transferencias, o solo destino para despachos.
 * Obtiene ubicaciones activas del backend via getLocationsSecure.
 */
import React, { useState, useEffect } from 'react';
import { MapPin, ArrowRight, Building2, Warehouse, Loader2 } from 'lucide-react';
import { getLocationsSecure, getWarehousesByLocationSecure } from '@/actions/locations-v2';
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
    const [warehouseByLocation, setWarehouseByLocation] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const loadLocations = async () => {
            setLoading(true);

            try {
                const res = await getLocationsSecure();
                if (!mounted) return;

                if (!res.success || !res.data) {
                    setLocations([]);
                    setWarehouseByLocation({});
                    setLoading(false);
                    return;
                }

                const activeLocations = res.data.filter(loc => loc.is_active !== false);
                setLocations(activeLocations);

                // Para transferencia: resolver bodega para sucursales sin default_warehouse_id.
                // Esto evita que queden ocultas en el selector de destino.
                if (mode === 'both') {
                    const missingDefaults = activeLocations.filter(
                        loc => !loc.default_warehouse_id && loc.type !== 'WAREHOUSE'
                    );

                    const resolved = await Promise.all(missingDefaults.map(async (loc) => {
                        const warehouseRes = await getWarehousesByLocationSecure(loc.id);
                        const warehouseId = warehouseRes.success ? (warehouseRes.data?.[0]?.id || '') : '';
                        return [loc.id, warehouseId] as const;
                    }));

                    if (!mounted) return;

                    const warehouseMap = Object.fromEntries(
                        resolved.filter((entry) => Boolean(entry[1]))
                    );
                    setWarehouseByLocation(warehouseMap);
                } else {
                    setWarehouseByLocation({});
                }
            } catch {
                if (!mounted) return;
                setLocations([]);
                setWarehouseByLocation({});
            } finally {
                if (mounted) setLoading(false);
            }
        };

        void loadLocations();

        return () => { mounted = false; };
    }, [mode]);

    const getLocationGroup = (type?: string): 'STORE' | 'WAREHOUSE' | null => {
        if (type === 'STORE' || type === 'KIOSK') return 'STORE';
        if (type === 'WAREHOUSE' || type === 'HQ') return 'WAREHOUSE';
        return null;
    };

    const getTypeLabel = (type?: string) => (
        getLocationGroup(type) === 'STORE' ? 'Sucursal' : 'Bodega'
    );

    const getWarehouseValue = (loc?: Location): string => {
        if (!loc) return '';
        return loc.default_warehouse_id || warehouseByLocation[loc.id] || (loc.type === 'WAREHOUSE' ? loc.id : '');
    };

    const currentLocation = locations.find(l => l.id === currentLocationId);
    const currentGroup = getLocationGroup(currentLocation?.type);
    const defaultOriginWarehouseId = getWarehouseValue(currentLocation);

    // Modo despacho (destino por location_id): solo grupo opuesto.
    // Regla: Bodega <-> Sucursal.
    const destinationOptions = locations.filter(location => {
        if (location.id === currentLocationId) return false;
        const group = getLocationGroup(location.type);
        if (!group || !currentGroup) return false;
        return group !== currentGroup;
    });

    // Modo transferencia (origen/destino por warehouse_id)
    // Regla: mismo grupo (Sucursal<->Sucursal o Bodega<->Bodega).
    const transferOptionsRaw = locations
        .filter(location => {
            const group = getLocationGroup(location.type);
            if (!group || !currentGroup) return false;
            return group === currentGroup;
        })
        .map(location => ({ location, warehouseId: getWarehouseValue(location) }))
        .filter(option => Boolean(option.warehouseId));

    const seenTransferWarehouses = new Set<string>();
    const transferOptions = transferOptionsRaw.filter(({ warehouseId }) => {
        if (!warehouseId || seenTransferWarehouses.has(warehouseId)) return false;
        seenTransferWarehouses.add(warehouseId);
        return true;
    });

    const originOptions = transferOptions.filter(option => option.warehouseId !== selectedDestination);
    const destinationTransferOptions = transferOptions.filter(
        option => option.warehouseId !== (selectedOrigin || defaultOriginWarehouseId)
    );

    const handleDestinationSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = e.target.value;
        if (!selectedValue) {
            onDestinationChange('', '');
            return;
        }

        if (mode === 'both') {
            const selected = transferOptions.find(option => option.warehouseId === selectedValue);
            if (selected) onDestinationChange(selected.warehouseId, selected.location.name);
            return;
        }

        const loc = destinationOptions.find(location => location.id === selectedValue);
        if (loc) onDestinationChange(loc.id, loc.name);
    };

    const handleOriginSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const selectedValue = e.target.value;
        if (!selectedValue) {
            if (onOriginChange) onOriginChange('', '');
            return;
        }
        const selected = transferOptions.find(option => option.warehouseId === selectedValue);
        if (selected && onOriginChange) onOriginChange(selected.warehouseId, selected.location.name);
    };

    const selectClass = `w-full p-3 bg-white border-2 border-slate-200 rounded-xl 
                         font-medium text-slate-800
                         focus:border-sky-400 focus:ring-4 focus:ring-sky-100
                         disabled:bg-slate-50 disabled:text-slate-400
                         transition-all duration-200 outline-none appearance-none
                         cursor-pointer`;

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
        const destinationEmptyLabel = currentGroup === 'STORE'
            ? 'No hay bodegas destino disponibles'
            : 'No hay sucursales destino disponibles';
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
                        disabled={disabled || destinationOptions.length === 0}
                        className={selectClass}
                    >
                        <option value="">
                            {destinationOptions.length > 0 ? 'Seleccionar destino...' : destinationEmptyLabel}
                        </option>
                        {destinationOptions.map(loc => (
                            <option key={loc.id} value={loc.id}>
                                {loc.name} ({getTypeLabel(loc.type)})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        );
    }

    // Modo 'both': Origen ↔ Destino (para Transferencias)
    const transferEntityLabel = currentGroup === 'STORE' ? 'sucursales' : 'bodegas';
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
                        value={selectedOrigin || defaultOriginWarehouseId}
                        onChange={handleOriginSelect}
                        disabled={disabled || originOptions.length === 0}
                        className={selectClass}
                    >
                        <option value="">
                            {originOptions.length > 0 ? 'Seleccionar origen...' : `No hay ${transferEntityLabel} origen disponibles`}
                        </option>
                        {/* Incluir current como opción por defecto */}
                        {originOptions.map(({ location, warehouseId }) => (
                            <option key={warehouseId} value={warehouseId}>
                                {location.name} {warehouseId === defaultOriginWarehouseId ? '(Actual)' : ''}
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
                        disabled={disabled || destinationTransferOptions.length === 0}
                        className={selectClass}
                    >
                        <option value="">
                            {destinationTransferOptions.length > 0 ? 'Seleccionar destino...' : `No hay ${transferEntityLabel} destino disponibles`}
                        </option>
                        {destinationTransferOptions.map(({ location, warehouseId }) => (
                            <option key={warehouseId} value={warehouseId}>
                                {location.name} ({getTypeLabel(location.type)})
                            </option>
                        ))}
                    </select>
                </div>
            </div>
        </div>
    );
};

export default WMSLocationPicker;
