import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Package, DollarSign, Users, Settings, AlertTriangle, Wrench, ExternalLink } from 'lucide-react';
import { Notification, useNotificationStore } from '../../store/useNotificationStore';

interface NotificationItemProps {
    notification: Notification;
    onClose: () => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onClose }) => {
    const navigate = useNavigate();
    const { markAsRead, deleteNotification } = useNotificationStore();

    const getCategoryIcon = () => {
        switch (notification.category) {
            case 'STOCK': return <Package size={20} />;
            case 'CASH': return <DollarSign size={20} />;
            case 'HR': return <Users size={20} />;
            case 'OPERATIONS': return <Settings size={20} />;
            case 'ALERT': return <AlertTriangle size={20} />;
            case 'SYSTEM': return <Wrench size={20} />;
            default: return <Settings size={20} />;
        }
    };

    const getSeverityColor = () => {
        switch (notification.severity) {
            case 'CRITICAL': return 'bg-red-100 text-red-600 border-red-200';
            case 'WARNING': return 'bg-amber-100 text-amber-600 border-amber-200';
            case 'INFO': return 'bg-blue-100 text-blue-600 border-blue-200';
            default: return 'bg-slate-100 text-slate-600 border-slate-200';
        }
    };

    const getTimeAgo = (dateStr: string | number) => {
        const timestamp = typeof dateStr === 'string' ? new Date(dateStr).getTime() : dateStr;
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Ahora';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `Hace ${minutes} min`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `Hace ${hours} h`;
        const days = Math.floor(hours / 24);
        return `Hace ${days} d`;
    };

    const handleClick = () => {
        if (!notification.read) {
            markAsRead(notification.id);
        }
        if (notification.metadata?.actionUrl) {
            navigate(notification.metadata.actionUrl);
            onClose();
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        deleteNotification(notification.id);
    };

    return (
        <div
            onClick={handleClick}
            className={`p-4 hover:bg-slate-50 transition cursor-pointer relative ${!notification.read ? 'bg-purple-50/50' : ''
                }`}
        >
            <div className="flex gap-3">
                {/* Icon */}
                <div className={`p-2 rounded-lg border flex-shrink-0 ${getSeverityColor()}`}>
                    {getCategoryIcon()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                        <h4 className={`font-bold text-sm ${!notification.read ? 'text-slate-900' : 'text-slate-700'}`}>
                            {notification.title}
                        </h4>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-slate-400">
                                {getTimeAgo(notification.created_at)}
                            </span>
                            <button
                                onClick={handleDelete}
                                className="p-1 hover:bg-slate-200 rounded transition"
                                title="Eliminar"
                            >
                                <X size={14} className="text-slate-400" />
                            </button>
                        </div>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">
                        {notification.message}
                    </p>
                    {notification.metadata?.actionUrl && (
                        <div className="flex items-center gap-1 text-xs text-purple-600 font-bold">
                            <ExternalLink size={12} />
                            Ver detalles
                        </div>
                    )}
                    {!notification.read && (
                        <div className="absolute left-0 top-4 w-1 h-12 bg-purple-600 rounded-r" />
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationItem;
