import React, { useEffect } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useLocationStore } from '../../store/useLocationStore';

interface NotificationBellProps {
    userRole: string;
}

const NotificationBell: React.FC<NotificationBellProps> = () => {
    const { unreadCount, toggleCenter, fetchNotifications } = useNotificationStore();
    const { currentLocation } = useLocationStore();

    useEffect(() => {
        if (currentLocation?.id) {
            fetchNotifications(currentLocation.id);
            const interval = setInterval(() => fetchNotifications(currentLocation.id), 30000);
            return () => clearInterval(interval);
        }
    }, [currentLocation?.id]);

    return (
        <button
            onClick={toggleCenter}
            className="relative p-2 text-slate-600 hover:text-purple-600 transition rounded-lg hover:bg-purple-50 outline-none"
            aria-label="Notificaciones"
        >
            <Bell size={24} />
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
};

export default NotificationBell;

