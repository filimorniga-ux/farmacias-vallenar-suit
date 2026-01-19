'use client';

import React, { useMemo } from 'react';
import { Bell, CheckCheck, Loader2, Package, DollarSign, Users, Warehouse, Settings, X } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotificationStore, NotificationCategory } from '../../store/useNotificationStore';
import NotificationItem from './NotificationItem';

interface NotificationCenterProps {
    userRole?: string;
    onClose?: () => void;
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ userRole, onClose }) => {
    const {
        notifications,
        isOpen,
        isCenterOpen,
        setOpen,
        setCenterOpen,
        markAllAsRead,
        isLoading,
        error,
        unreadCount
    } = useNotificationStore();

    const [activeCategory, setActiveCategory] = React.useState<NotificationCategory>('ALL');

    // Use isCenterOpen for backward compatibility or isOpen for new usage
    const isCurrentlyOpen = isCenterOpen || isOpen;

    // Handle close - use provided onClose or store action
    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            setOpen(false);
            setCenterOpen(false);
        }
    };

    // Filter notifications by category and optionally by role
    const filteredNotifications = useMemo(() => {
        let filtered = notifications;

        // Filter by category
        if (activeCategory !== 'ALL') {
            filtered = filtered.filter(n => n.category === activeCategory);
        }

        // Filter by role if provided
        if (userRole) {
            filtered = filtered.filter(n => n.roleTarget === 'ALL' || n.roleTarget === userRole);
        }

        return filtered;
    }, [notifications, activeCategory, userRole]);

    const categories: Array<{ key: NotificationCategory; label: string; icon: React.ReactNode }> = [
        { key: 'ALL', label: 'Todas', icon: <Bell size={16} /> },
        { key: 'INVENTORY', label: 'Stock', icon: <Package size={16} /> },
        { key: 'CASH', label: 'Caja', icon: <DollarSign size={16} /> },
        { key: 'HR', label: 'RRHH', icon: <Users size={16} /> },
        { key: 'WMS', label: 'Logística', icon: <Warehouse size={16} /> },
        { key: 'SYSTEM', label: 'Sistema', icon: <Settings size={16} /> },
    ];

    const handleMarkAllAsRead = async () => {
        await markAllAsRead();
    };

    const getCategoryCount = (category: NotificationCategory) => {
        if (category === 'ALL') return notifications.filter(n => !n.read).length;
        return notifications.filter(n => n.category === category && !n.read).length;
    };

    return (
        <Sheet open={isCurrentlyOpen} onOpenChange={(open) => open ? null : handleClose()}>
            <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
                {/* Header */}
                <SheetHeader className="p-6 pb-4 border-b bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 rounded-lg">
                                <Bell size={24} />
                            </div>
                            <div>
                                <SheetTitle className="text-xl">Centro de Notificaciones</SheetTitle>
                                <p className="text-sm text-muted-foreground">
                                    {unreadCount} sin leer
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleMarkAllAsRead}
                                disabled={unreadCount === 0}
                                className="flex items-center gap-2"
                            >
                                <CheckCheck size={16} />
                                <span className="hidden sm:inline">Marcar todas leídas</span>
                            </Button>
                            <Button variant="ghost" size="icon" onClick={handleClose}>
                                <X size={20} />
                            </Button>
                        </div>
                    </div>
                </SheetHeader>

                {/* Tabs - Category Filter */}
                <div className="px-4 py-3 border-b">
                    <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as NotificationCategory)}>
                        <TabsList className="w-full grid grid-cols-6 h-auto p-1">
                            {categories.map(cat => {
                                const count = getCategoryCount(cat.key);
                                return (
                                    <TabsTrigger
                                        key={cat.key}
                                        value={cat.key}
                                        className="relative flex flex-col gap-1 py-2 px-2 text-xs data-[state=active]:bg-purple-100 dark:data-[state=active]:bg-purple-900"
                                    >
                                        {cat.icon}
                                        <span className="hidden sm:inline">{cat.label}</span>
                                        {count > 0 && (
                                            <Badge
                                                variant="destructive"
                                                className="h-4 min-w-4 p-0 flex items-center justify-center text-[10px] absolute -top-1 -right-1"
                                            >
                                                {count > 9 ? '9+' : count}
                                            </Badge>
                                        )}
                                    </TabsTrigger>
                                );
                            })}
                        </TabsList>
                    </Tabs>
                </div>

                {/* Notifications List */}
                <ScrollArea className="flex-1">
                    {isLoading ? (
                        <div className="p-4 space-y-4">
                            {[1, 2, 3].map(i => (
                                <div key={i} className="flex gap-3 p-4">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-3 w-full" />
                                        <Skeleton className="h-3 w-1/2" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
                            <Settings size={64} className="mb-4 opacity-30" />
                            <p className="text-lg font-semibold mb-2">Error de conexión</p>
                            <p className="text-sm text-center">{error}</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 min-h-[300px]">
                            <Bell size={64} className="mb-4 opacity-30" />
                            <p className="text-lg font-semibold mb-2">Sin notificaciones</p>
                            <p className="text-sm text-center">
                                No hay notificaciones
                                {activeCategory !== 'ALL' && ` de ${categories.find(c => c.key === activeCategory)?.label}`}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredNotifications.map(notification => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                />
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};

export default NotificationCenter;
