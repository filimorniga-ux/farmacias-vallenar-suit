import React, { useState, useMemo } from 'react';
import { X, Bell, Trash2, CheckCheck, Filter } from 'lucide-react';
import { useNotificationStore, NotificationCategory } from '../../store/useNotificationStore';
import NotificationItem from './NotificationItem';

interface NotificationCenterProps {
    userRole: string;
    onClose: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ userRole, onClose }) => {
    const { notifications, markAllAsRead, clearAll } = useNotificationStore();
    const [activeCategory, setActiveCategory] = useState<NotificationCategory | 'ALL'>('ALL');

    // Filter notifications by role and category
    const filteredNotifications = useMemo(() => {
        return notifications.filter(n => {
            const roleMatch = n.roleTarget === 'ALL' || n.roleTarget === userRole;
            const categoryMatch = activeCategory === 'ALL' || n.category === activeCategory;
            return roleMatch && categoryMatch;
        });
    }, [notifications, userRole, activeCategory]);

    const unreadCount = filteredNotifications.filter(n => !n.read).length;

    const categories: Array<{ key: NotificationCategory | 'ALL'; label: string; icon: string }> = [
        { key: 'ALL', label: 'Todas', icon: '📋' },
        { key: 'STOCK', label: 'Stock', icon: '📦' },
        { key: 'CASH', label: 'Caja', icon: '💰' },
        { key: 'HR', label: 'RRHH', icon: '👥' },
        { key: 'OPERATIONS', label: 'Operaciones', icon: '⚙️' },
        { key: 'ALERT', label: 'Alertas', icon: '⚠️' },
        { key: 'SYSTEM', label: 'Sistema', icon: '🔧' },
    ];

    const handleMarkAllAsRead = () => {
        if (activeCategory === 'ALL') {
            markAllAsRead();
        } else {
            markAllAsRead(activeCategory);
        }
    };

    const handleClearAll = () => {
        if (confirm(`¿Borrar todas las notificaciones${activeCategory !== 'ALL' ? ` de ${categories.find(c => c.key === activeCategory)?.label}` : ''}?`)) {
            if (activeCategory === 'ALL') {
                clearAll();
            } else {
                clearAll(activeCategory);
            }
        }
    };

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/30 z-40 animate-fadeIn"
                onClick={onClose}
            />

            {/* Sidebar Panel */}
            <div className="fixed right-0 top-0 h-full w-full md:w-[480px] bg-white shadow-2xl z-50 flex flex-col animate-slideInRight">
                {/* Header */}
                <div className="p-6 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-indigo-50">
                    <div className="flex justify-between items-center mb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 text-purple-600 rounded-lg">
                                <Bell size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-slate-900">
                                    Notificaciones
                                </h2>
                                <p className="text-sm text-slate-500">
                                    {unreadCount} sin leer
                                </p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-slate-100 rounded-lg transition"
                        >
                            <X size={24} />
                        </button>
                    </div>

                    {/* Categories Tabs */}
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {categories.map(cat => {
                            const catCount = cat.key === 'ALL'
                                ? filteredNotifications.length
                                : notifications.filter(n => n.category === cat.key && (n.roleTarget === 'ALL' || n.roleTarget === userRole)).length;

                            return (
                                <button
                                    key={cat.key}
                                    onClick={() => setActiveCategory(cat.key)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition whitespace-nowrap ${activeCategory === cat.key
                                            ? 'bg-purple-600 text-white shadow-lg'
                                            : 'bg-white text-slate-600 hover:bg-slate-100'
                                        }`}
                                >
                                    <span>{cat.icon}</span>
                                    <span>{cat.label}</span>
                                    {catCount > 0 && (
                                        <span className={`px-2 py-0.5 rounded-full text-xs ${activeCategory === cat.key
                                                ? 'bg-white/30'
                                                : 'bg-slate-200'
                                            }`}>
                                            {catCount}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Actions */}
                {filteredNotifications.length > 0 && (
                    <div className="px-6 py-3 border-b border-slate-100 flex gap-2">
                        <button
                            onClick={handleMarkAllAsRead}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition"
                        >
                            <CheckCheck size={16} />
                            Marcar todas leídas
                        </button>
                        <button
                            onClick={handleClearAll}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                            <Trash2 size={16} />
                            Borrar todas
                        </button>
                    </div>
                )}

                {/* Notifications List */}
                <div className="flex-1 overflow-y-auto">
                    {filteredNotifications.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8">
                            <Bell size={64} className="mb-4 opacity-50" />
                            <p className="text-lg font-bold mb-2">Sin notificaciones</p>
                            <p className="text-sm text-center">
                                No hay notificaciones {activeCategory !== 'ALL' && `de ${categories.find(c => c.key === activeCategory)?.label}`}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {filteredNotifications.map(notification => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onClose={onClose}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default NotificationCenter;
