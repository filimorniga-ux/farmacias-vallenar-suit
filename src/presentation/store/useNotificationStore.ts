import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type NotificationType = 'INFO' | 'WARNING' | 'CRITICAL' | 'SUCCESS';
export type NotificationRole = 'ALL' | 'MANAGER' | 'CASHIER' | 'WAREHOUSE' | 'QF';

export interface Notification {
    id: string;
    title: string;
    message: string;
    type: NotificationType;
    roleTarget: NotificationRole;
    read: boolean;
    timestamp: number;
    link?: string;
}

interface NotificationState {
    notifications: Notification[];
    pushNotification: (notification: Omit<Notification, 'id' | 'read' | 'timestamp'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
    getUnreadCount: (userRole: string) => number;
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

            markAllAsRead: () => {
                set((state) => ({
                    notifications: state.notifications.map((n) => ({ ...n, read: true })),
                }));
            },

            clearAll: () => {
                set({ notifications: [] });
            },

            getUnreadCount: (userRole) => {
                const { notifications } = get();
                return notifications.filter(
                    (n) =>
                        !n.read &&
                        (n.roleTarget === 'ALL' || n.roleTarget === userRole)
                ).length;
            },
        }),
        {
            name: 'notification-storage',
        }
    )
);
