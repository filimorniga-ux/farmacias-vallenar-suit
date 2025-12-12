import React from 'react';
import { useLocationStore } from '../../store/useLocationStore';
import { usePharmaStore } from '../../store/useStore';
import { MapPin, Monitor, Package } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const ContextBadge = () => {
    const { locations, currentLocation } = useLocationStore();
    const { currentLocationId, currentTerminalId, terminals, currentShift } = usePharmaStore();
    const routeLocation = useLocation();

    // Resolve comprehensive location object
    // usage of both stores is needed because usePharmaStore holds the ID often set by auth,
    // while useLocationStore holds the full objects.
    const activeLocation = currentLocation || locations.find(l => l.id === currentLocationId);

    // Resolve terminal
    const activeTerminal = terminals.find(t => t.id === currentTerminalId);
    const isShiftOpen = currentShift?.status === 'ACTIVE';

    // Detect WMS/Inventory Context
    const isWMS = routeLocation.pathname.includes('/inventory') || routeLocation.pathname.includes('/warehouse');

    if (!activeLocation) return null;

    return (
        <div className="flex items-center gap-2 md:gap-3">
            {/* Location Badge (Always Visible) */}
            <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-blue-50 text-blue-700 rounded-full border border-blue-100 shadow-sm animate-in slide-in-from-top-2 flex-shrink-0">
                <MapPin size={14} className="flex-shrink-0" />
                <span className="text-[10px] md:text-sm font-bold truncate max-w-[80px] md:max-w-[150px]">
                    {activeLocation.name}
                </span>
            </div>

            {/* Terminal Badge (Visible if Shift is Active or Terminal Selected) */}
            {(activeTerminal || isShiftOpen) && (
                <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 md:py-1.5 bg-orange-50 text-orange-700 rounded-full border border-orange-100 shadow-sm animate-in slide-in-from-top-2 delay-75 flex-shrink-0">
                    <Monitor size={14} className="flex-shrink-0" />
                    <span className="text-[10px] md:text-sm font-bold truncate max-w-[60px] md:max-w-none">
                        {activeTerminal?.name || 'Caja'}
                    </span>
                </div>
            )}

            {/* WMS Context Badge (Visible only in Inventory/WMS) */}
            {isWMS && activeLocation.default_warehouse_id && (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-full border border-purple-100 shadow-sm animate-in slide-in-from-top-2 delay-100">
                    <Package size={14} className="flex-shrink-0" />
                    <span className="text-xs md:text-sm font-bold">
                        Bodega Principal
                    </span>
                </div>
            )}
        </div>
    );
};

export default ContextBadge;
