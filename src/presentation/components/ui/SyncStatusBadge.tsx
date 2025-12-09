'use client';

import { useState, useEffect } from 'react';
import { usePharmaStore } from '../../store/useStore';
import { toast } from 'sonner';
import { Loader2, Wifi, WifiOff, RefreshCw } from 'lucide-react';

export const SyncStatusBadge = () => {
    const { syncData, isLoading } = usePharmaStore();
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        // Set initial state
        setIsOnline(navigator.onLine);

        const handleOnline = () => {
            setIsOnline(true);
            toast.success('Conexión Restaurada', { description: 'Sincronizando datos...' });
            syncData({ force: true });
        };

        const handleOffline = () => {
            setIsOnline(false);
            toast.warning('Modo Sin Conexión', { description: 'Los cambios se guardarán localmente.' });
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [syncData]);

    const handleManualSync = async () => {
        if (!isOnline) {
            toast.error('No hay conexión a internet');
            return;
        }

        try {
            await syncData({ force: true });
            toast.success('Datos Actualizados', { description: 'La información se ha sincronizado con el servidor.' });
        } catch (error) {
            toast.error('Error al sincronizar');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full text-xs font-medium border border-blue-100 cursor-wait animate-pulse">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Sincronizando...</span>
            </div>
        );
    }

    if (!isOnline) {
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-full text-xs font-medium border border-red-100">
                <WifiOff className="w-3.5 h-3.5" />
                <span>Desconectado</span>
            </div>
        );
    }

    return (
        <button
            onClick={handleManualSync}
            className="group flex items-center gap-2 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-600 rounded-full text-xs font-medium border border-emerald-100 transition-colors"
            title="Clic para sincronizar ahora"
        >
            <Wifi className="w-3.5 h-3.5" />
            <span>Conectado</span>
            <RefreshCw className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
        </button>
    );
};
