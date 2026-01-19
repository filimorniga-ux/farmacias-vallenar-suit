'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
    X, Package, DollarSign, Users, Warehouse, Settings,
    AlertTriangle, ExternalLink, CheckCircle, Info, AlertCircle
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Badge } from '@/components/ui/badge';
import { Notification, useNotificationStore } from '../../store/useNotificationStore';

interface NotificationItemProps {
    notification: Notification;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification }) => {
    const router = useRouter();
    const { markAsRead, deleteNotification, setOpen } = useNotificationStore();

    // Dynamic icon based on type
    const getTypeIcon = () => {
        switch (notification.type) {
            case 'INVENTORY': return <Package size={20} />;
            case 'CASH': return <DollarSign size={20} />;
            case 'HR': return <Users size={20} />;
            case 'WMS': return <Warehouse size={20} />;
            case 'SYSTEM': return <Settings size={20} />;
            default: return <Info size={20} />;
        }
    };

    // Severity badge color
    const getSeverityStyles = () => {
        switch (notification.severity) {
            case 'ERROR': return {
                bg: 'bg-red-100 dark:bg-red-900/30',
                text: 'text-red-600 dark:text-red-400',
                border: 'border-red-200 dark:border-red-800',
                icon: <AlertCircle size={14} className="text-red-500" />
            };
            case 'WARNING': return {
                bg: 'bg-amber-100 dark:bg-amber-900/30',
                text: 'text-amber-600 dark:text-amber-400',
                border: 'border-amber-200 dark:border-amber-800',
                icon: <AlertTriangle size={14} className="text-amber-500" />
            };
            case 'SUCCESS': return {
                bg: 'bg-green-100 dark:bg-green-900/30',
                text: 'text-green-600 dark:text-green-400',
                border: 'border-green-200 dark:border-green-800',
                icon: <CheckCircle size={14} className="text-green-500" />
            };
            case 'INFO':
            default: return {
                bg: 'bg-blue-100 dark:bg-blue-900/30',
                text: 'text-blue-600 dark:text-blue-400',
                border: 'border-blue-200 dark:border-blue-800',
                icon: <Info size={14} className="text-blue-500" />
            };
        }
    };

    // Relative time with date-fns
    const getTimeAgo = (dateStr: string) => {
        try {
            const date = new Date(dateStr);
            return formatDistanceToNow(date, { addSuffix: true, locale: es });
        } catch {
            return 'Hace un momento';
        }
    };

    // Get navigation URL from link or metadata
    const getActionUrl = (): string | null => {
        if (notification.link) return notification.link;
        if (notification.metadata?.actionUrl) return notification.metadata.actionUrl;

        // Auto-generate URLs based on type
        switch (notification.type) {
            case 'INVENTORY': return '/logistica';
            case 'CASH': return '/caja';
            case 'HR': return '/rrhh';
            case 'WMS': return '/wms';
            default: return null;
        }
    };

    const handleClick = () => {
        if (!notification.read) {
            markAsRead(notification.id);
        }

        const actionUrl = getActionUrl();
        if (actionUrl) {
            setOpen(false);
            router.push(actionUrl);
        }
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        deleteNotification(notification.id);
    };

    const severityStyles = getSeverityStyles();
    const actionUrl = getActionUrl();

    return (
        <div
            onClick={handleClick}
            className={`
                p-4 hover:bg-accent/50 transition-colors cursor-pointer relative group
                ${!notification.read ? 'bg-purple-50/50 dark:bg-purple-950/20' : ''}
            `}
        >
            {/* Unread indicator */}
            {!notification.read && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-600 dark:bg-purple-400" />
            )}

            <div className="flex gap-3">
                {/* Icon */}
                <div className={`
                    p-2.5 rounded-lg border flex-shrink-0 
                    ${severityStyles.bg} ${severityStyles.text} ${severityStyles.border}
                `}>
                    {getTypeIcon()}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 mb-1">
                        <div className="flex items-center gap-2">
                            <h4 className={`
                                font-semibold text-sm line-clamp-1
                                ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}
                            `}>
                                {notification.title}
                            </h4>
                            {severityStyles.icon}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">
                                {getTimeAgo(notification.created_at)}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={handleDelete}
                                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                <X size={14} />
                            </Button>
                        </div>
                    </div>

                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                        {notification.message}
                    </p>

                    {/* Action link */}
                    {actionUrl && (
                        <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 font-medium">
                            <ExternalLink size={12} />
                            Ver detalles
                        </div>
                    )}

                    {/* Metadata preview */}
                    {notification.metadata && Object.keys(notification.metadata).length > 0 && (
                        <HoverCard>
                            <HoverCardTrigger asChild>
                                <Badge variant="secondary" className="mt-2 cursor-help text-xs">
                                    +{Object.keys(notification.metadata).length} datos
                                </Badge>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-72">
                                <div className="text-xs space-y-1">
                                    <p className="font-semibold mb-2">Detalles adicionales:</p>
                                    {Object.entries(notification.metadata).slice(0, 5).map(([key, value]) => (
                                        <div key={key} className="flex justify-between">
                                            <span className="text-muted-foreground">{key}:</span>
                                            <span className="font-mono truncate max-w-[150px]">
                                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NotificationItem;
