import React, { useState } from 'react';
import { Bell, Check, Trash2, X, AlertTriangle, Info, CheckCircle, AlertCircle } from 'lucide-react';
import { useNotificationStore, Notification } from '../../store/useNotificationStore';
import { usePharmaStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';

const NotificationCenter: React.FC = () => {
    const { notifications, markAsRead, markAllAsRead, clearAll, getUnreadCount } = useNotificationStore();
    const { user } = usePharmaStore();
    const [isOpen, setIsOpen] = useState(false);

    const userRole = user?.role || 'GUEST';
    const unreadCount = getUnreadCount(userRole);

    const filteredNotifications = notifications.filter(
        n => n.roleTarget === 'ALL' || n.roleTarget === userRole
    );

    const getIcon = (type: string) => {
        switch (type) {
            case 'CRITICAL': return <AlertCircle className="text-red-500" size={20} />;
            case 'WARNING': return <AlertTriangle className="text-amber-500" size={20} />;
            case 'SUCCESS': return <CheckCircle className="text-emerald-500" size={20} />;
            default: return <Info className="text-blue-500" size={20} />;
        }
    };

    const getBorderColor = (type: string) => {
        switch (type) {
            case 'CRITICAL': return 'border-l-4 border-l-red-500 bg-red-50/50';
            case 'WARNING': return 'border-l-4 border-l-amber-500 bg-amber-50/50';
            case 'SUCCESS': return 'border-l-4 border-l-emerald-500 bg-emerald-50/50';
            default: return 'border-l-4 border-l-blue-500 bg-blue-50/50';
        }
    };

    return (
        <div className="relative z-50">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors"
            >
                <Bell size={24} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold flex items-center justify-center rounded-full animate-bounce">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        <div
                            className="fixed inset-0 z-40"
                            onClick={() => setIsOpen(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                            className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                        >
                            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 backdrop-blur-sm">
                                <h3 className="font-bold text-slate-800">Notificaciones</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => markAllAsRead()}
                                        className="text-xs font-bold text-cyan-600 hover:text-cyan-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-cyan-50"
                                        title="Marcar todas como leídas"
                                    >
                                        <Check size={14} /> Leídas
                                    </button>
                                    <button
                                        onClick={() => clearAll()}
                                        className="text-xs font-bold text-slate-400 hover:text-red-500 flex items-center gap-1 px-2 py-1 rounded hover:bg-red-50"
                                        title="Borrar todas"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[400px] overflow-y-auto">
                                {filteredNotifications.length === 0 ? (
                                    <div className="p-8 text-center text-slate-400">
                                        <Bell size={48} className="mx-auto mb-3 opacity-20" />
                                        <p className="text-sm">No tienes notificaciones nuevas</p>
                                    </div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {filteredNotifications.map(notification => (
                                            <div
                                                key={notification.id}
                                                className={`p-4 hover:bg-slate-50 transition-colors relative group ${notification.read ? 'opacity-60' : 'bg-white'} ${getBorderColor(notification.type)}`}
                                                onClick={() => markAsRead(notification.id)}
                                            >
                                                <div className="flex gap-3">
                                                    <div className="mt-1 flex-shrink-0">
                                                        {getIcon(notification.type)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start">
                                                            <h4 className={`text-sm font-bold ${notification.read ? 'text-slate-600' : 'text-slate-800'}`}>
                                                                {notification.title}
                                                            </h4>
                                                            <span className="text-[10px] text-slate-400 whitespace-nowrap ml-2">
                                                                {new Date(notification.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                                            {notification.message}
                                                        </p>
                                                    </div>
                                                </div>
                                                {!notification.read && (
                                                    <div className="absolute top-4 right-4 w-2 h-2 bg-cyan-500 rounded-full" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default NotificationCenter;
