'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useLocationStore } from '../../store/useLocationStore';
import { scheduleIdleTask } from '@/presentation/lib/scheduleIdleTask';

export default function NotificationBellRuntime() {
    const fetchNotifications = useNotificationStore((state) => state.fetchNotifications);
    const savePushToken = useNotificationStore((state) => state.savePushToken);
    const currentLocationId = useLocationStore((state) => state.currentLocation?.id);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const startPolling = useCallback(() => {
        if (intervalRef.current) return;
        intervalRef.current = setInterval(() => {
            if (!document.hidden) {
                void fetchNotifications(currentLocationId);
            }
        }, 60_000);
    }, [currentLocationId, fetchNotifications]);

    const stopPolling = useCallback(() => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (!currentLocationId) return;

        const cancelInitialFetch = scheduleIdleTask(() => {
            if (!document.hidden) {
                void fetchNotifications(currentLocationId);
            }
        }, 900);

        startPolling();

        const handleVisibility = () => {
            if (document.hidden) {
                stopPolling();
            } else {
                void fetchNotifications(currentLocationId, { force: true });
                startPolling();
            }
        };

        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            cancelInitialFetch();
            document.removeEventListener('visibilitychange', handleVisibility);
            stopPolling();
        };
    }, [currentLocationId, fetchNotifications, startPolling, stopPolling]);

    useEffect(() => {
        const initPush = async () => {
            try {
                const capacitorRuntime = (window as Window & {
                    Capacitor?: { isNativePlatform?: () => boolean };
                }).Capacitor;

                if (!capacitorRuntime?.isNativePlatform?.()) {
                    return;
                }

                const { initPushNotifications } = await import('@/lib/pushNotifications');
                await initPushNotifications((value) => {
                    void savePushToken(value);
                });
            } catch {
                // Push nativo no disponible o sin permisos: no bloquear UI web.
            }
        };

        void initPush();
    }, [savePushToken]);

    return null;
}
