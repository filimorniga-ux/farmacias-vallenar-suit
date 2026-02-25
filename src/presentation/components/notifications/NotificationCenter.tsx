'use client';

import React, { useMemo, useState } from 'react';
import {
    Bell, CheckCheck, Loader2, Package, DollarSign, Users, Warehouse,
    Settings, X, Trash2, CheckSquare, Square, TrendingUp, ArrowRightLeft,
    AlertTriangle, LayoutList
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useNotificationStore, NotificationCategory, Notification } from '../../store/useNotificationStore';
import NotificationItem from './NotificationItem';
import { isToday, isYesterday, isThisWeek, format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NotificationCenterProps {
    userRole?: string;
    onClose?: () => void;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CATEGORIES: Array<{ key: NotificationCategory; label: string; icon: React.ReactNode }> = [
    { key: 'ALL', label: 'Todas', icon: <Bell size={14} /> },
    { key: 'INVENTORY', label: 'Stock', icon: <Package size={14} /> },
    { key: 'WMS', label: 'WMS', icon: <Warehouse size={14} /> },
    { key: 'CASH', label: 'Caja', icon: <DollarSign size={14} /> },
    { key: 'HR', label: 'RRHH', icon: <Users size={14} /> },
    { key: 'SYSTEM', label: 'Sistema', icon: <Settings size={14} /> },
];

// ─── Date grouping ────────────────────────────────────────────────────────────

const getDateGroup = (dateStr: string): string => {
    try {
        const d = new Date(dateStr);
        if (isToday(d)) return 'Hoy';
        if (isYesterday(d)) return 'Ayer';
        if (isThisWeek(d, { weekStartsOn: 1 })) return 'Esta semana';
        return format(d, "EEEE d 'de' MMMM", { locale: es });
    } catch {
        return 'Anteriores';
    }
};

type GroupedNotifications = { group: string; items: Notification[] }[];

// ─── Component ────────────────────────────────────────────────────────────────

const NotificationCenter: React.FC<NotificationCenterProps> = ({ onClose }) => {
    const {
        notifications, isOpen, isLoading, error, unreadCount,
        setOpen, activeCategory, setActiveCategory,
        markAllAsRead, markSelectedAsRead, deleteSelected,
        selectedIds, selectAll, clearSelection, toggleSelect,
    } = useNotificationStore();

    const [isSelecting, setIsSelecting] = useState(false);

    const handleClose = () => {
        if (onClose) { onClose(); } else { setOpen(false); }
        clearSelection();
        setIsSelecting(false);
    };

    // ── Filter ────────────────────────────────────────────────────────────────
    const filteredNotifications = useMemo(() => {
        if (activeCategory === 'ALL') return notifications;
        // Mapear categoría a los tipos correspondientes
        const typeMap: Record<NotificationCategory, string[]> = {
            ALL: [],
            INVENTORY: ['INVENTORY', 'STOCK_CRITICAL'],
            CASH: ['CASH'],
            HR: ['HR'],
            WMS: ['WMS', 'TRANSFER'],
            SYSTEM: ['SYSTEM', 'CONFIG', 'GENERAL'],
        };
        const allowedTypes = typeMap[activeCategory] ?? [];
        return notifications.filter((n) => allowedTypes.includes(n.type));
    }, [notifications, activeCategory]);

    // ── Group by date ─────────────────────────────────────────────────────────
    const grouped: GroupedNotifications = useMemo(() => {
        const groups: Record<string, Notification[]> = {};
        const ORDER = ['Hoy', 'Ayer', 'Esta semana'];
        for (const n of filteredNotifications) {
            const g = getDateGroup(n.created_at);
            if (!groups[g]) groups[g] = [];
            groups[g].push(n);
        }
        const sortedKeys = Object.keys(groups).sort((a, b) => {
            const ai = ORDER.indexOf(a);
            const bi = ORDER.indexOf(b);
            if (ai === -1 && bi === -1) return 0;
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
        });
        return sortedKeys.map((g) => ({ group: g, items: groups[g] }));
    }, [filteredNotifications]);

    // ── Category unread count ─────────────────────────────────────────────────
    const getCategoryCount = (cat: NotificationCategory) => {
        const typeMap: Record<NotificationCategory, string[]> = {
            ALL: [],
            INVENTORY: ['INVENTORY', 'STOCK_CRITICAL'],
            CASH: ['CASH'],
            HR: ['HR'],
            WMS: ['WMS', 'TRANSFER'],
            SYSTEM: ['SYSTEM', 'CONFIG', 'GENERAL'],
        };
        if (cat === 'ALL') return notifications.filter((n) => !n.read).length;
        return notifications.filter((n) => typeMap[cat].includes(n.type) && !n.read).length;
    };

    // ── Batch actions ─────────────────────────────────────────────────────────
    const handleSelectAll = () => {
        if (selectedIds.size === filteredNotifications.length) {
            clearSelection();
        } else {
            selectAll(filteredNotifications.map((n) => n.id));
        }
    };

    const handleMarkSelectedRead = async () => {
        await markSelectedAsRead();
        setIsSelecting(false);
    };

    const handleDeleteSelected = async () => {
        await deleteSelected();
        setIsSelecting(false);
    };

    const allCurrentSelected = selectedIds.size > 0 && selectedIds.size === filteredNotifications.length;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => open ? null : handleClose()}>
            <SheetContent className="w-full sm:max-w-md flex flex-col p-0 gap-0">

                {/* ── Header ────────────────────────────────────────────────── */}
                <SheetHeader className="p-5 pb-4 border-b bg-gradient-to-br from-purple-50 via-white to-indigo-50 dark:from-purple-950/30 dark:via-background dark:to-indigo-950/20 flex-shrink-0">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-300 rounded-xl">
                                <Bell size={20} />
                            </div>
                            <div>
                                <SheetTitle className="text-base font-bold leading-tight">
                                    Notificaciones
                                </SheetTitle>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día ✓'}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            {/* Botón seleccionar */}
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { setIsSelecting(!isSelecting); clearSelection(); }}
                                className={`text-xs h-8 px-2 gap-1.5 ${isSelecting ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700' : ''}`}
                            >
                                <LayoutList size={14} />
                                <span className="hidden sm:inline">{isSelecting ? 'Cancelar' : 'Seleccionar'}</span>
                            </Button>

                            {/* Marcar todas leídas */}
                            {!isSelecting && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => markAllAsRead()}
                                    disabled={unreadCount === 0}
                                    className="text-xs h-8 px-2 gap-1.5"
                                    title="Marcar todas como leídas"
                                >
                                    <CheckCheck size={14} />
                                    <span className="hidden sm:inline">Leer todas</span>
                                </Button>
                            )}

                            <Button variant="ghost" size="icon" onClick={handleClose} className="h-8 w-8">
                                <X size={16} />
                            </Button>
                        </div>
                    </div>

                    {/* ── Barra de acciones en lote (cuando isSelecting) ─── */}
                    {isSelecting && (
                        <div className="flex items-center gap-2 mt-3 p-2.5 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-100 dark:border-purple-900">
                            <button
                                onClick={handleSelectAll}
                                className="flex items-center gap-1.5 text-xs text-purple-700 dark:text-purple-300 font-medium hover:underline"
                            >
                                {allCurrentSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                                {allCurrentSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                            </button>

                            {selectedIds.size > 0 && (
                                <>
                                    <div className="w-px h-4 bg-border" />
                                    <Badge variant="secondary" className="text-[10px] font-bold px-1.5">
                                        {selectedIds.size} seleccionadas
                                    </Badge>
                                    <div className="flex-1" />
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2.5 text-xs gap-1"
                                        onClick={handleMarkSelectedRead}
                                    >
                                        <CheckCheck size={12} />
                                        Leer
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 px-2.5 text-xs gap-1 text-red-600 border-red-200 hover:bg-red-50"
                                        onClick={handleDeleteSelected}
                                    >
                                        <Trash2 size={12} />
                                        Eliminar
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </SheetHeader>

                {/* ── Category Tabs ──────────────────────────────────────────── */}
                <div className="flex-shrink-0 px-3 py-2 border-b bg-background">
                    <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5">
                        {CATEGORIES.map((cat) => {
                            const count = getCategoryCount(cat.key);
                            const isActive = activeCategory === cat.key;
                            return (
                                <button
                                    key={cat.key}
                                    onClick={() => setActiveCategory(cat.key)}
                                    className={`
                                        flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap
                                        transition-colors flex-shrink-0 relative
                                        ${isActive
                                            ? 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
                                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                        }
                                    `}
                                >
                                    {cat.icon}
                                    {cat.label}
                                    {count > 0 && (
                                        <span className={`
                                            min-w-4 h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center
                                            ${isActive ? 'bg-purple-600 text-white' : 'bg-red-500 text-white'}
                                        `}>
                                            {count > 9 ? '9+' : count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* ── Notifications List ─────────────────────────────────────── */}
                <ScrollArea className="flex-1">
                    {isLoading ? (
                        <div className="p-4 space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="flex gap-3 p-3">
                                    <Skeleton className="h-9 w-9 rounded-lg flex-shrink-0" />
                                    <div className="flex-1 space-y-2">
                                        <Skeleton className="h-3 w-16" />
                                        <Skeleton className="h-4 w-3/4" />
                                        <Skeleton className="h-3 w-full" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-10 min-h-[300px]">
                            <AlertTriangle size={48} className="mb-3 opacity-30 text-red-400" />
                            <p className="text-sm font-semibold mb-1">Error de conexión</p>
                            <p className="text-xs text-center max-w-[200px]">{error}</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center text-muted-foreground p-10 min-h-[300px]">
                            <div className="w-16 h-16 rounded-2xl bg-purple-50 dark:bg-purple-950/30 flex items-center justify-center mb-4">
                                <Bell size={32} className="text-purple-300" />
                            </div>
                            <p className="text-sm font-semibold mb-1">Sin notificaciones</p>
                            <p className="text-xs text-center text-muted-foreground max-w-[180px]">
                                {activeCategory !== 'ALL'
                                    ? `No hay notificaciones de ${CATEGORIES.find((c) => c.key === activeCategory)?.label}`
                                    : 'Estás al día con todo'
                                }
                            </p>
                        </div>
                    ) : (
                        <div className="pb-4">
                            {grouped.map(({ group, items }) => (
                                <div key={group}>
                                    {/* Fecha separador */}
                                    <div className="px-4 pt-3 pb-1.5 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                            {group}
                                        </span>
                                    </div>
                                    <div className="divide-y">
                                        {items.map((n) => (
                                            <NotificationItem
                                                key={n.id}
                                                notification={n}
                                                isSelecting={isSelecting}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
};

export default NotificationCenter;
