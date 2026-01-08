import React, { useState } from 'react';
import {
    Wifi,
    WifiOff,
    RefreshCw,
    AlertTriangle
} from 'lucide-react';
import { useOutboxStore } from '../../../lib/store/outboxStore';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';

import SyncConflictsModal from '../offline/SyncConflictsModal';

/**
 * SyncStatusIndicator Component
 * 
 * "Source of Truth" for application connectivity and sync status.
 * Implements a strict priority table:
 * 1. Offline (Red)
 * 2. Conflict/Error (Amber)
 * 3. Syncing (Blue)
 * 4. Online/Idle (Green/Subtle)
 * 
 * Features:
 * - Responsive (Icon only on mobile, Pill on desktop)
 * - SSR Compatible via useNetworkStatus
 * - Animated transitions
 */
const SyncStatusIndicator: React.FC = () => {
    const { isOnline } = useNetworkStatus();
    const { queue } = useOutboxStore();
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);

    // Computed States
    const pendingItems = queue.filter((i) => i.status === 'PENDING').length;
    const errorItems = queue.filter((i) => i.status === 'ERROR' || i.status === 'CONFLICT').length;

    // Check if store is actively syncing (pending items exist or global loading is true in sync context)
    // Note: queue.length > 0 includes done/error items depending on cleanup policy, 
    // so we specifically look for PENDING or active processing logic.
    // For this strict table, "Syncing" = Online AND (Store is processing OR Pending Items > 0).
    const isStoreSyncing = useOutboxStore(state => state.isSyncing);
    const isSyncing = isOnline && (isStoreSyncing || pendingItems > 0);

    // --- PRIORITY 1: OFFLINE ---
    if (!isOnline) {
        return (
            <>
                <div
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-bold shadow-sm transition-all duration-300 animate-in fade-in"
                    title="Sin conexión a internet"
                    role="status"
                    aria-label="Modo Offline"
                >
                    <WifiOff size={16} />
                    <span className="hidden sm:inline">Modo Offline</span>
                </div>
                {/* Modal generally not needed here as interaction is low, but could be added if we want to show pending queue */}
            </>
        );
    }

    // --- PRIORITY 2: CONFLICT / ERROR ---
    if (errorItems > 0) {
        return (
            <>
                <button
                    onClick={() => setIsConflictModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black rounded-full text-xs font-bold shadow-sm hover:scale-105 transition-all duration-300 animate-in zoom-in-95 cursor-pointer"
                    title={`${errorItems} errores de sincronización. Clic para ver detalles.`}
                    role="alert"
                    aria-label="Error de Sincronización"
                >
                    <AlertTriangle size={16} />
                    <span className="hidden sm:inline">Error de Sync ({errorItems})</span>
                </button>

                <SyncConflictsModal
                    isOpen={isConflictModalOpen}
                    onClose={() => setIsConflictModalOpen(false)}
                />
            </>
        );
    }

    // --- PRIORITY 3: SYNCING ---
    if (isSyncing) {
        return (
            <div
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-full text-xs font-bold shadow-sm transition-all duration-300"
                title="Sincronizando datos con el servidor..."
                role="status"
                aria-label="Sincronizando"
            >
                <RefreshCw size={16} className="animate-spin" />
                <span className="hidden sm:inline">Sincronizando ({pendingItems})...</span>
            </div>
        );
    }

    // --- PRIORITY 4: ONLINE / IDLE ---
    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold border border-emerald-100/50 hover:bg-emerald-100 transition-colors duration-300"
            title="Conexión estable y sincronizada"
            role="status"
            aria-label="En Línea"
        >
            <Wifi size={16} className="text-emerald-500" />
            <span className="hidden sm:inline">En Línea</span>
        </div>
    );
};

export default SyncStatusIndicator;
