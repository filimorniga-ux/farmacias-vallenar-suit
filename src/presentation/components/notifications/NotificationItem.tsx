'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    Package, DollarSign, Users, Warehouse, Settings,
    AlertTriangle, CheckCircle, Info, AlertCircle,
    Trash2, TrendingUp, ArrowRight, ChevronRight
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Notification, useNotificationStore } from '../../store/useNotificationStore';

interface NotificationItemProps {
    notification: Notification;
    isSelecting: boolean;
}

// ─── Helper functions ─────────────────────────────────────────────────────────

const getTypeConfig = (type: string) => {
    const map: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
        INVENTORY: { icon: <Package size={18} />, label: 'Inventario', color: 'text-cyan-600 bg-cyan-50 border-cyan-200' },
        CASH: { icon: <DollarSign size={18} />, label: 'Caja', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' },
        HR: { icon: <Users size={18} />, label: 'RRHH', color: 'text-violet-600 bg-violet-50 border-violet-200' },
        WMS: { icon: <Warehouse size={18} />, label: 'Logística', color: 'text-blue-600 bg-blue-50 border-blue-200' },
        SYSTEM: { icon: <Settings size={18} />, label: 'Sistema', color: 'text-slate-600 bg-slate-50 border-slate-200' },
        PROCUREMENT: { icon: <TrendingUp size={18} />, label: 'Pedidos', color: 'text-purple-600 bg-purple-50 border-purple-200' },
        TRANSFER: { icon: <ArrowRight size={18} />, label: 'Traspaso', color: 'text-amber-600 bg-amber-50 border-amber-200' },
        STOCK_CRITICAL: { icon: <AlertTriangle size={18} />, label: 'Stock', color: 'text-red-600 bg-red-50 border-red-200' },
    };
    return map[type] ?? { icon: <Info size={18} />, label: 'General', color: 'text-slate-500 bg-slate-50 border-slate-200' };
};

const getSeverityIndicator = (severity: string) => {
    switch (severity) {
        case 'CRITICAL':
        case 'ERROR': return <AlertCircle size={13} className="text-red-500 flex-shrink-0" />;
        case 'WARNING': return <AlertTriangle size={13} className="text-amber-500 flex-shrink-0" />;
        case 'SUCCESS': return <CheckCircle size={13} className="text-emerald-500 flex-shrink-0" />;
        default: return null;
    }
};

const getActionUrl = (notification: Notification): string | null => {
    if (notification.actionUrl) return notification.actionUrl;
    if (notification.link) return notification.link;
    if (notification.metadata?.actionUrl) return notification.metadata.actionUrl as string;
    // FIX B7: Auto-generar URLs de destino precisas por tipo
    const urlMap: Record<string, string> = {
        INVENTORY: '/logistica',
        CASH: '/caja',
        HR: '/rrhh',
        WMS: '/wms',
        PROCUREMENT: '/cadena-suministro',
        TRANSFER: '/wms',
        STOCK_CRITICAL: '/logistica',
    };
    return urlMap[notification.type] ?? null;
};

const getTimeAgo = (dateStr: string): string => {
    try {
        return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es });
    } catch {
        return 'Hace un momento';
    }
};

// ─── Component ────────────────────────────────────────────────────────────────

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, isSelecting }) => {
    const router = useRouter();
    const { markAsRead, deleteNotification, setOpen, selectedIds, toggleSelect } = useNotificationStore();

    const typeConfig = getTypeConfig(notification.type);
    const actionUrl = getActionUrl(notification);
    const isSelected = selectedIds.has(notification.id);

    const handleClick = () => {
        if (isSelecting) {
            toggleSelect(notification.id);
            return;
        }
        if (!notification.read) markAsRead(notification.id);
        if (actionUrl) {
            setOpen(false);
            router.push(actionUrl);
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        deleteNotification(notification.id);
    };

    return (
        <div
            onClick={handleClick}
            className={`
                relative flex gap-3 p-4 transition-colors cursor-pointer group
                ${isSelected ? 'bg-purple-50 dark:bg-purple-950/30' : ''}
                ${!isSelected && !notification.read ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}
                hover:bg-accent/50
            `}
        >
            {/* Barra lateral de no leído */}
            {!notification.read && !isSelected && (
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-purple-500 rounded-r" />
            )}

            {/* Checkbox (en modo selección) o ícono de tipo */}
            <div className="flex-shrink-0 mt-0.5">
                {isSelecting ? (
                    <div className={`
                        w-9 h-9 rounded-lg border-2 flex items-center justify-center transition-colors
                        ${isSelected
                            ? 'bg-purple-600 border-purple-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 hover:border-purple-400'
                        }
                    `}>
                        {isSelected && <CheckCircle size={16} />}
                    </div>
                ) : (
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${typeConfig.color}`}>
                        {typeConfig.icon}
                    </div>
                )}
            </div>

            {/* Contenido */}
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {typeConfig.label}
                        </span>
                        {getSeverityIndicator(notification.severity)}
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
                        {getTimeAgo(notification.created_at)}
                    </span>
                </div>

                <h4 className={`text-sm font-semibold leading-snug line-clamp-1 ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {notification.title}
                </h4>

                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {notification.message}
                </p>

                {/* CTA de navegación */}
                {actionUrl && !isSelecting && (
                    <div className="flex items-center gap-1 mt-1.5 text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                        <span>Ir a {typeConfig.label}</span>
                        <ChevronRight size={11} />
                    </div>
                )}
            </div>

            {/* Botón eliminar (hover, sin modo selección) */}
            {!isSelecting && (
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDelete}
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:text-red-600 hover:bg-red-50"
                    aria-label="Eliminar notificación"
                >
                    <Trash2 size={13} />
                </Button>
            )}
        </div>
    );
};

export default NotificationItem;
