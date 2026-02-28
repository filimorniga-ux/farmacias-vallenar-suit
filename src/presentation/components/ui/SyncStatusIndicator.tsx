import React, { useState } from 'react';
import {
    Wifi,
    WifiOff,
    RefreshCw,
    AlertTriangle,
    HardDrive,
    Database
} from 'lucide-react';
import { useOutboxStore } from '../../../lib/store/outboxStore';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useSyncStatus, isElectronEnv } from '../../../hooks/useOfflineDB';

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
 * Enhanced for Electron:
 * - Shows SQLite local database indicator when in Electron
 * - Uses Electron's sync service for more accurate connectivity detection
 * - Shows pending sync queue count from SQLite
 * 
 * Features:
 * - Responsive (Icon only on mobile, Pill on desktop)
 * - SSR Compatible via useNetworkStatus
 * - Animated transitions
 */
const SyncStatusIndicator: React.FC = () => {
    const { isOnline: browserOnline } = useNetworkStatus();
    const electronSync = useSyncStatus();
    const { queue } = useOutboxStore();
    const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
    const isElectron = isElectronEnv();

    // Use Electron sync status when available, otherwise browser
    const isOnline = isElectron ? electronSync.isOnline : browserOnline;

    // Compute pending/error from both web outbox and Electron queue
    const webPending = queue.filter((i) => i.status === 'PENDING').length;
    const webErrors = queue.filter((i) => i.status === 'ERROR' || i.status === 'CONFLICT').length;
    const electronPending = isElectron ? electronSync.pendingItems : 0;
    const electronErrors = isElectron ? electronSync.failedItems : 0;

    const totalPending = webPending + electronPending;
    const totalErrors = webErrors + electronErrors;

    const isStoreSyncing = useOutboxStore(state => state.isSyncing);
    const isSyncing = isOnline && (isStoreSyncing || totalPending > 0 || (isElectron && electronSync.isSyncing));

    // --- PRIORITY 1: OFFLINE ---
    if (!isOnline) {
        return (
            <>
                <div
                    className="flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-full text-xs font-bold shadow-sm transition-all duration-300 animate-in fade-in"
                    title={isElectron ? "Sin internet — Trabajando con datos locales (SQLite)" : "Sin conexión a internet"}
                    role="status"
                    aria-label="Modo Offline"
                >
                    <WifiOff size={16} />
                    <span className="hidden sm:inline">
                        {isElectron ? 'Offline Local' : 'Modo Offline'}
                    </span>
                    {isElectron && (
                        <span aria-label="Base de datos local activa">
                            <Database size={14} className="text-red-200" />
                        </span>
                    )}
                </div>
            </>
        );
    }

    // --- PRIORITY 2: CONFLICT / ERROR ---
    if (totalErrors > 0) {
        return (
            <>
                <button
                    onClick={() => setIsConflictModalOpen(true)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 text-black rounded-full text-xs font-bold shadow-sm hover:scale-105 transition-all duration-300 animate-in zoom-in-95 cursor-pointer"
                    title={`${totalErrors} errores de sincronización. Clic para ver detalles.`}
                    role="alert"
                    aria-label="Error de Sincronización"
                >
                    <AlertTriangle size={16} />
                    <span className="hidden sm:inline">Error de Sync ({totalErrors})</span>
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
                title={`Sincronizando ${totalPending} operaciones con el servidor...`}
                role="status"
                aria-label="Sincronizando"
            >
                <RefreshCw size={16} className="animate-spin" />
                <span className="hidden sm:inline">Sincronizando ({totalPending})...</span>
            </div>
        );
    }

    // --- PRIORITY 4: ONLINE / IDLE ---
    return (
        <div
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-xs font-bold border border-emerald-100/50 hover:bg-emerald-100 transition-colors duration-300"
            title={isElectron ? "Conexión estable — Datos locales + servidor sincronizados" : "Conexión estable y sincronizada"}
            role="status"
            aria-label="En Línea"
        >
            <Wifi size={16} className="text-emerald-500" />
            <span className="hidden sm:inline">En Línea</span>
            {isElectron && (
                <span aria-label="Datos locales sincronizados">
                    <HardDrive size={14} className="text-emerald-400" />
                </span>
            )}
        </div>
    );
};

export default SyncStatusIndicator;
