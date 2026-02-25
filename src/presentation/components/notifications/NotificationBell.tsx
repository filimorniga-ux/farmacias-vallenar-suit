'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useLocationStore } from '../../store/useLocationStore';

interface NotificationBellProps {
    className?: string;
    userRole?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className }) => {
    const { unreadCount, toggleOpen, fetchNotifications, isLoading } = useNotificationStore();
    const locationStore = useLocationStore();
    const currentLocationId = locationStore?.currentLocation?.id;
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startPolling = useCallback(() => {
        if (intervalRef.current) return;
        intervalRef.current = setInterval(() => {
            // Solo fetchear si la pestaña está activa (FIX B8)
            if (!document.hidden) {
                fetchNotifications(currentLocationId);
            }
        }, 60_000); // Reducido a 60s para no saturar el servidor
    }, [currentLocationId, fetchNotifications]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!currentLocationId) return;

        // Carga inicial
        fetchNotifications(currentLocationId);
        startPolling();

        // FIX B8: Pausar polling cuando la pestaña está oculta (ahorra conexiones)
        const handleVisibility = () => {
            if (document.hidden) {
                stopPolling();
            } else {
                fetchNotifications(currentLocationId);
                startPolling();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            stopPolling();
        };
    }, [currentLocationId, fetchNotifications, startPolling, stopPolling]);

    // Inicializar push nativo en Capacitor (solo iOS/Android)
    // @capacitor/push-notifications se instala con: npm i @capacitor/push-notifications && npx cap sync
    useEffect(() => {
        const initPush = async () => {
            try {
                const { Capacitor } = await import('@capacitor/core');
                if (!Capacitor.isNativePlatform()) return;

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const mod: any = await import('@capacitor/push-notifications' as any);
                const PushNotifications = mod.PushNotifications;

                const permission = await PushNotifications.requestPermissions();
                if (permission.receive !== 'granted') return;
                await PushNotifications.register();

                PushNotifications.addListener('registration', ({ value }: { value: string }) => {
                    useNotificationStore.getState().savePushToken(value);
                });
            } catch {
                // Capacitor o push-notifications no disponibles en web — ignorar
            }
        };
        initPush();
    }, []);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleOpen}
            className={`relative ${className ?? ''}`}
            aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        >
            <Bell
                size={22}
                className={isLoading ? 'animate-pulse' : ''}
            />

            {unreadCount > 0 && (
                <>
                    <Badge
                        variant="destructive"
                        className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold animate-in zoom-in-50 duration-200"
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </Badge>
                    {/* Pulse solo cuando hay no leídas */}
                    <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-400 animate-ping opacity-75 pointer-events-none" />
                </>
            )}
        </Button>
    );
};

export default NotificationBell;
