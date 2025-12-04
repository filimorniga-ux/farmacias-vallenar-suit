import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Notification Event Types
export type NotificationEventType =
    | 'STOCK_CRITICAL'
    | 'AUTO_ORDER_GENERATED'
    | 'CASH_REGISTER_OPEN'
    | 'CASH_REGISTER_CLOSE'
    | 'SHIFT_CHANGE'
    | 'ATTENDANCE_LATE'
    | 'ATTENDANCE_MISSING'
    | 'CASH_MOVEMENT_LARGE'
    | 'EXPENSE_ALERT'
    | 'PO_RECEIVED'
    | 'PO_DELAYED'
    | 'PRODUCT_CREATED'
    | 'PRODUCT_UPDATED'
    | 'PRODUCT_DELETED'
    | 'GENERAL';

export type NotificationCategory = 'STOCK' | 'CASH' | 'HR' | 'OPERATIONS' | 'ALERT' | 'SYSTEM';
export type NotificationSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
export type NotificationRole = 'ALL' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE' | 'QF';

export interface Notification {
    id: string;
    eventType: NotificationEventType;
    category: NotificationCategory;
    severity: NotificationSeverity;
    title: string;
    message: string;
    roleTarget: NotificationRole;
    read: boolean;
    timestamp: number;
    actionUrl?: string;
    metadata?: Record<string, any>;
}

interface NotificationState {
    notifications: Notification[];
    pushNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: (category?: NotificationCategory) => void;
    deleteNotification: (id: string) => void;
    clearAll: (category?: NotificationCategory) => void;
    getUnreadCount: (userRole: string, category?: NotificationCategory) => number;
    getByCategory: (category: NotificationCategory) => Notification[];
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            notifications: [],

            pushNotification: (notification) => {
                const newNotification: Notification = {
                    ...notification,
                    id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    read: false,
                    timestamp: Date.now(),
                };
                set((state) => ({
                    notifications: [newNotification, ...state.notifications],
                }));
            },

            markAsRead: (id) => {
                set((state) => ({
                    notifications: state.notifications.map((n) =>
                        n.id === id ? { ...n, read: true } : n
                    ),
                }));
            },

            markAllAsRead: (category) => {
                set((state) => ({
                    notifications: state.notifications.map((n) =>
                        category ? (n.category === category ? { ...n, read: true } : n) : { ...n, read: true }
                    ),
                }));
            },

            deleteNotification: (id) => {
                set((state) => ({
                    notifications: state.notifications.filter((n) => n.id !== id),
                }));
            },

            clearAll: (category) => {
                set((state) => ({
                    notifications: category
                        ? state.notifications.filter((n) => n.category !== category)
                        : [],
                }));
            },

            getUnreadCount: (userRole, category) => {
                const { notifications } = get();
                return notifications.filter(
                    (n) =>
                        !n.read &&
                        (n.roleTarget === 'ALL' || n.roleTarget === userRole) &&
                        (!category || n.category === category)
                ).length;
            },

            getByCategory: (category) => {
                const { notifications } = get();
                return notifications.filter((n) => n.category === category);
            },
        }),
        {
            name: 'notification-storage',
        }
    )
);
