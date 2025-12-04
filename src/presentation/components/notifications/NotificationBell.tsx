import React, { useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '../../store/useNotificationStore';
import NotificationCenter from './NotificationCenter';

interface NotificationBellProps {
    userRole: string;
}

const NotificationBell: React.FC<NotificationBellProps> = ({ userRole }) => {
    const [isOpen, setIsOpen] = useState(false);
    const getUnreadCount = useNotificationStore(state => state.getUnreadCount);

    const unreadCount = getUnreadCount(userRole);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className="relative p-2 text-slate-600 hover:text-purple-600 transition rounded-lg hover:bg-purple-50"
                aria-label="Notifications"
            >
                <Bell size={24} />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <NotificationCenter
                    userRole={userRole}
                    onClose={() => setIsOpen(false)}
                />
            )}
        </>
    );
};

export default NotificationBell;
