'use client';

import { create } from 'zustand';
import { getNotificationsSecure, markAsReadSecure, markAllAsReadSecure, NotificationType, NotificationSeverity } from '@/actions/notifications-v2';

export interface Notification {
    id: string;
    type: NotificationType;
    category?: string;
    severity: NotificationSeverity;
    title: string;
    message: string;
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
    // Keep both naming conventions for backward compatibility
    isOpen: boolean;
    isCenterOpen: boolean;
    isLoading: boolean;
    error: string | null;

    // Actions - keep both naming conventions
    setOpen: (isOpen: boolean) => void;
    setCenterOpen: (isOpen: boolean) => void;
    toggleOpen: () => void;
    toggleCenter: () => void;
    fetchNotifications: (locationId?: string) => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: (locationId?: string) => Promise<void>;
    deleteNotification: (id: string) => void;
    clearAll: (category?: NotificationCategory) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isOpen: false,
    isCenterOpen: false,
    isLoading: false,
    error: null,

    setOpen: (isOpen) => set({ isOpen, isCenterOpen: isOpen }),
    setCenterOpen: (isOpen) => set({ isOpen, isCenterOpen: isOpen }),
    toggleOpen: () => set((state) => ({ isOpen: !state.isOpen, isCenterOpen: !state.isCenterOpen })),
    toggleCenter: () => set((state) => ({ isOpen: !state.isOpen, isCenterOpen: !state.isCenterOpen })),

    fetchNotifications: async (locationId) => {
        set({ isLoading: true, error: null });
        try {
            const res = await getNotificationsSecure(locationId);
            if (res.success && res.data) {
                const mapped: Notification[] = res.data.map((n: any) => ({
                    id: n.id,
                    type: n.type,
                    category: n.type, // Map type to category for filtering
                    severity: n.severity,
                    title: n.title,
                    message: n.message,
                    link: n.link || n.metadata?.actionUrl,
                    metadata: n.metadata,
                    read: n.is_read,
                    created_at: n.created_at,
                    roleTarget: 'ALL'
                }));
                set({
                    notifications: mapped,
                    unreadCount: res.unreadCount || mapped.filter(n => !n.read).length,
                    isLoading: false
                });
            } else {
                set({ isLoading: false, error: res.error || 'Error loading notifications' });
            }
        } catch (e: any) {
            console.error("Failed to fetch notifications", e);
            set({ isLoading: false, error: e.message || 'Error de conexión' });
        }
    },

    markAsRead: async (id) => {
        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
            unreadCount: Math.max(0, state.unreadCount - 1)
        }));
        try {
            await markAsReadSecure([id]);
        } catch (e) {
            console.error("Failed to mark as read", e);
            get().fetchNotifications();
        }
    },

    markAllAsRead: async (locationId) => {
        // Optimistic update
        set((state) => ({
            notifications: state.notifications.map(n => ({ ...n, read: true })),
            unreadCount: 0
        }));
        try {
            await markAllAsReadSecure(locationId);
        } catch (e) {
            console.error("Failed to mark all as read", e);
            get().fetchNotifications();
        }
    },

    deleteNotification: (id) => {
        set((state) => ({
            notifications: state.notifications.filter(n => n.id !== id),
            unreadCount: state.notifications.find(n => n.id === id)?.read === false
                ? Math.max(0, state.unreadCount - 1)
                : state.unreadCount
        }));
    },

    clearAll: async (category) => {
        set((state) => ({
            notifications: category && category !== 'ALL'
                ? state.notifications.filter(n => n.category !== category)
                : [],
            unreadCount: 0
        }));
    }
}));
