import React, { useState, useEffect } from 'react';
import { Bell, Check, ExternalLink } from 'lucide-react';
import { usePharmaStore } from '@/presentation/store/useStore';
// V2: Funciones seguras con sesión
import { getMyNotifications, markAsReadSecure } from '@/actions/notifications-v2';
import { useRouter } from 'next/navigation';

interface NotificationBellProps {
    userRole: string; // Kept for interface compatibility or future use
}

const NotificationBell: React.FC<NotificationBellProps> = () => {
    const { user } = usePharmaStore();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);

    const loadNotifications = async () => {
        if (!user?.id) return;
        // V2: getMyNotifications usa sesión de headers
        const res = await getMyNotifications();
        if (res.success && res.data) {
            setNotifications(res.data);
            setUnreadCount(res.unreadCount || 0);
        }
    };

    useEffect(() => {
        loadNotifications();
        // Poll every 30 seconds for new notifications
        const interval = setInterval(loadNotifications, 30000);
        return () => clearInterval(interval);
    }, [user?.id]);

    const handleMarkAsRead = async (id: string, link?: string) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(prev => Math.max(0, prev - 1));

        // V2: markAsReadSecure
        await markAsReadSecure(id);
        if (link) {
            setIsOpen(false);
            router.push(link);
        }
    };

    return (
        <div className="relative">
            <button
                onClick={() => { setIsOpen(!isOpen); loadNotifications(); }}
                className="relative p-2 text-slate-600 hover:text-purple-600 transition rounded-lg hover:bg-purple-50 outline-none"
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
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
                    <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 overflow-hidden animate-in slide-in-from-top-2">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Notificaciones</h3>
                            <span className="text-xs text-slate-500">{unreadCount} no leídas</span>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto">
                            {notifications.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">
                                    <Bell size={32} className="mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">No tienes notificaciones</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {notifications.map(n => (
                                        <div
                                            key={n.id}
                                            className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer group ${!n.is_read ? 'bg-purple-50/50' : ''}`}
                                            onClick={() => handleMarkAsRead(n.id, n.link)}
                                        >
                                            <div className="flex gap-3">
                                                <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${!n.is_read ? 'bg-purple-500' : 'bg-transparent'}`} />
                                                <div className="flex-1 space-y-1">
                                                    <div className="flex justify-between items-start">
                                                        <p className={`text-sm font-medium ${!n.is_read ? 'text-slate-900' : 'text-slate-600'}`}>{n.title}</p>
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 line-clamp-2">{n.message}</p>
                                                    {n.link && (
                                                        <p className="text-xs text-purple-600 flex items-center gap-1 mt-1 group-hover:underline">
                                                            <ExternalLink size={10} /> Ver detalles
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};


export default NotificationBell;
