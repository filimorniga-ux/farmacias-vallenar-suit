import { create } from 'zustand';
import { getNotificationsSecure, markAsReadSecure, markAllAsReadSecure, NotificationType, NotificationSeverity } from '@/actions/notifications-v2';

export interface Notification {
    id: string;
    type: NotificationType;
    category?: string;
    severity: NotificationSeverity;
    title: string;
    message: string;
    roleTarget: string;
    read: boolean;
    created_at: string;
    metadata?: Record<string, any>;
}

export type NotificationCategory = 'STOCK' | 'CASH' | 'HR' | 'OPERATIONS' | 'ALERT' | 'SYSTEM' | 'ALL';

interface NotificationState {
    notifications: Notification[];
    unreadCount: number;
    isCenterOpen: boolean;

    toggleCenter: () => void;
    setCenterOpen: (isOpen: boolean) => void;
    fetchNotifications: (locationId?: string) => Promise<void>;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: (category?: NotificationCategory) => Promise<void>;
    deleteNotification: (id: string) => void;
    clearAll: (category?: NotificationCategory) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
    notifications: [],
    unreadCount: 0,
    isCenterOpen: false,

    toggleCenter: () => set((state) => ({ isCenterOpen: !state.isCenterOpen })),
    setCenterOpen: (isOpen) => set({ isCenterOpen: isOpen }),

    fetchNotifications: async (locationId) => {
        try {
            const res = await getNotificationsSecure(locationId);
            if (res.success && res.data) {
                const mapped: Notification[] = res.data.map((n: any) => ({
                    id: n.id,
                    type: n.type,
                    category: n.type,
                    severity: n.severity,
                    title: n.title,
                    message: n.message,
                    metadata: n.metadata,
                    read: n.is_read,
                    created_at: n.created_at,
                    roleTarget: 'ALL'
                }));
                set({
                    notifications: mapped,
                    unreadCount: res.unreadCount
                });
            }
        } catch (e) {
            console.error("Failed to fetch notifications", e);
        }
    },

    markAsRead: async (id) => {
        set((state) => ({
            notifications: state.notifications.map(n => n.id === id ? { ...n, read: true } : n),
            unreadCount: Math.max(0, state.unreadCount - 1)
        }));
        await markAsReadSecure([id]);
    },

    markAllAsRead: async (category) => {
        set((state) => ({
            notifications: state.notifications.map(n =>
                (!category || category === 'ALL' || n.category === category)
                    ? { ...n, read: true }
                    : n
            ),
            unreadCount: 0 // Simplification, ideally calculate real unread count
        }));
        await markAllAsReadSecure(); // Server handles logic
    },

    deleteNotification: (id) => {
        set((state) => ({
            notifications: state.notifications.filter(n => n.id !== id)
        }));
    },

    clearAll: async (category) => {
        set((state) => ({
            notifications: category && category !== 'ALL'
                ? state.notifications.filter(n => n.category !== category)
                : [],
            unreadCount: 0
        }));
        // Server integration for delete not implemented yet, client side only for clear
    }
}));
