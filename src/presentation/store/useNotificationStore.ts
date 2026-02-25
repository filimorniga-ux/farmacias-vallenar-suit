'use client';

import { create } from 'zustand';
import {
    getNotificationsSecure,
    markAsReadSecure,
    markAllAsReadSecure,
    deleteNotificationSecure,
    savePushTokenSecure,
    NotificationType,
    NotificationSeverity,
} from '@/actions/notifications-v2';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Notification {
    id: string;
    type: NotificationType;
    category?: string;
    severity: NotificationSeverity;
    title: string;
    message: string;
    /** URL de destino al hacer click */
    actionUrl?: string;
    /** @deprecated uso legado — usar actionUrl */
    link?: string;
    roleTarget: string;
    read: boolean;
    created_at: string;
    metadata?: Record<string, any>;
}

export type NotificationCategory = 'INVENTORY' | 'CASH' | 'HR' | 'WMS' | 'SYSTEM' | 'ALL';

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    // FIX B10: Estado unificado (no duplicado)
    isOpen: boolean;
    isLoading: boolean;
    error: string | null;
    activeCategory: NotificationCategory;

    /** IDs de notificaciones seleccionadas (para acciones en lote) */
    selectedIds: Set<string>;

    // ── Open/close ──────────────────────────────────────────────────────────
    setOpen: (open: boolean) => void;
    /** @deprecated Alias para `setOpen` — mantener compatibilidad */
    setCenterOpen: (open: boolean) => void;
    toggleOpen: () => void;
    /** @deprecated Alias para `toggleOpen` */
    toggleCenter: () => void;

    // ── Category filter ──────────────────────────────────────────────────────
    setActiveCategory: (cat: NotificationCategory) => void;

    // ── Fetch ────────────────────────────────────────────────────────────────
    fetchNotifications: (locationId?: string) => Promise<void>;

    // ── Mark as read ─────────────────────────────────────────────────────────
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: (locationId?: string) => Promise<void>;
    markSelectedAsRead: () => Promise<void>;

    // ── Delete ───────────────────────────────────────────────────────────────
    deleteNotification: (id: string) => Promise<void>;
    deleteSelected: () => Promise<void>;

    // ── Selection (multi-select) ────────────────────────────────────────────
    toggleSelect: (id: string) => void;
    selectAll: (ids: string[]) => void;
    clearSelection: () => void;

    // ── Push token ───────────────────────────────────────────────────────────
    savePushToken: (token: string) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mapServerNotification = (n: any): Notification => ({
    id: n.id,
    type: n.type,
    category: n.type,
    severity: n.severity,
    title: n.title,
    message: n.message,
    actionUrl: n.action_url ?? n.metadata?.actionUrl,
    link: n.action_url ?? n.metadata?.actionUrl,
    metadata: n.metadata,
    read: n.is_read,
    created_at: n.created_at,
    roleTarget: 'ALL',
});

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isOpen: false,
    isLoading: false,
    error: null,
    activeCategory: 'ALL',
    selectedIds: new Set(),

    // ── Open/close ────────────────────────────────────────────────────────────
    setOpen: (open) => set({ isOpen: open }),
    setCenterOpen: (open) => set({ isOpen: open }),      // compat legacy
    toggleOpen: () => set((s) => ({ isOpen: !s.isOpen })),
    toggleCenter: () => set((s) => ({ isOpen: !s.isOpen })), // compat legacy

    // ── Category ──────────────────────────────────────────────────────────────
    setActiveCategory: (cat) => set({ activeCategory: cat, selectedIds: new Set() }),

    // ── Fetch ─────────────────────────────────────────────────────────────────
    fetchNotifications: async (locationId) => {
        set({ isLoading: true, error: null });
        try {
            const res = await getNotificationsSecure(locationId);
            if (res.success && res.data) {
                const mapped = res.data.map(mapServerNotification);
                set({
                    notifications: mapped,
                    unreadCount: res.unreadCount ?? mapped.filter((n) => !n.read).length,
                    isLoading: false,
                });
            } else {
                set({ isLoading: false, error: res.error ?? 'Error al cargar notificaciones' });
            }
        } catch (e: any) {
            set({ isLoading: false, error: e.message ?? 'Error de conexión' });
        }
    },

    // ── Mark as read ──────────────────────────────────────────────────────────
    markAsRead: async (id) => {
        set((s) => ({
            notifications: s.notifications.map((n) => n.id === id ? { ...n, read: true } : n),
            unreadCount: Math.max(0, s.unreadCount - 1),
        }));
        try {
            await markAsReadSecure([id]);
        } catch {
            get().fetchNotifications();
        }
    },

    markAllAsRead: async (locationId) => {
        set((s) => ({
            notifications: s.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
        }));
        try {
            await markAllAsReadSecure(locationId);
        } catch {
            get().fetchNotifications();
        }
    },

    markSelectedAsRead: async () => {
        const ids = Array.from(get().selectedIds);
        if (ids.length === 0) return;
        set((s) => ({
            notifications: s.notifications.map((n) => ids.includes(n.id) ? { ...n, read: true } : n),
            unreadCount: Math.max(0, s.unreadCount - ids.filter((id) => !s.notifications.find((n) => n.id === id)?.read).length),
            selectedIds: new Set(),
        }));
        try {
            await markAsReadSecure(ids);
        } catch {
            get().fetchNotifications();
        }
    },

    // ── Delete ────────────────────────────────────────────────────────────────
    deleteNotification: async (id) => {
        const notif = get().notifications.find((n) => n.id === id);
        set((s) => ({
            notifications: s.notifications.filter((n) => n.id !== id),
            unreadCount: notif?.read === false ? Math.max(0, s.unreadCount - 1) : s.unreadCount,
        }));
        try {
            await deleteNotificationSecure([id]);
        } catch {
            get().fetchNotifications();
        }
    },

    deleteSelected: async () => {
        const ids = Array.from(get().selectedIds);
        if (ids.length === 0) return;
        const unreadToRemove = get().notifications.filter((n) => ids.includes(n.id) && !n.read).length;
        set((s) => ({
            notifications: s.notifications.filter((n) => !ids.includes(n.id)),
            unreadCount: Math.max(0, s.unreadCount - unreadToRemove),
            selectedIds: new Set(),
        }));
        try {
            await deleteNotificationSecure(ids);
        } catch {
            get().fetchNotifications();
        }
    },

    // ── Selection ─────────────────────────────────────────────────────────────
    toggleSelect: (id) => {
        set((s) => {
            const next = new Set(s.selectedIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            return { selectedIds: next };
        });
    },
    selectAll: (ids) => set({ selectedIds: new Set(ids) }),
    clearSelection: () => set({ selectedIds: new Set() }),

    // ── Push token ────────────────────────────────────────────────────────────
    savePushToken: async (token) => {
        try {
            await savePushTokenSecure(token);
        } catch {
            // Silent fail — not critical
        }
    },
}));
