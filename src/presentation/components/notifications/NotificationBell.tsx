'use client';

import React, { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useLocationStore } from '../../store/useLocationStore';

interface NotificationBellProps {
    className?: string;
    userRole?: string; // Added for compatibility with SidebarLayout
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className, userRole }) => {
    const { unreadCount, toggleOpen, fetchNotifications, isLoading } = useNotificationStore();
    const locationStore = useLocationStore();
    const currentLocationId = locationStore?.currentLocation?.id;

    // Fetch notifications on mount and set up polling
    useEffect(() => {
        if (currentLocationId) {
            // Initial fetch
            fetchNotifications(currentLocationId);

            // Poll every 30 seconds for new notifications
            const interval = setInterval(() => {
                fetchNotifications(currentLocationId);
            }, 30000);

            return () => clearInterval(interval);
        }
    }, [currentLocationId, fetchNotifications]);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleOpen}
            className={`relative ${className || ''}`}
            aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
        >
            <Bell
                size={22}
                className={isLoading ? 'animate-pulse' : ''}
            />

            {/* Unread count badge */}
            {unreadCount > 0 && (
                <Badge
                    variant="destructive"
                    className="absolute -top-1 -right-1 h-5 min-w-5 p-0 flex items-center justify-center text-[10px] font-bold animate-in zoom-in-50 duration-200"
                >
                    {unreadCount > 99 ? '99+' : unreadCount}
                </Badge>
            )}

            {/* Pulse animation for new notifications */}
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-400 animate-ping opacity-75" />
            )}
        </Button>
    );
};

export default NotificationBell;
