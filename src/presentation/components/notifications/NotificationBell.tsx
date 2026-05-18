'use client';

import React from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNotificationStore } from '../../store/useNotificationStore';

interface NotificationBellProps {
    className?: string;
    userRole?: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ className }) => {
    const unreadCount = useNotificationStore((state) => state.unreadCount);
    const toggleOpen = useNotificationStore((state) => state.toggleOpen);
    const isLoading = useNotificationStore((state) => state.isLoading);

    return (
        <Button
            variant="ghost"
            size="icon"
            onClick={toggleOpen}
            className={`relative min-h-11 min-w-11 touch-manipulation ${className ?? ''}`}
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
