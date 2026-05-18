/**
 * @vitest-environment jsdom
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getNotificationsSecureMock: vi.fn(),
    markAsReadSecureMock: vi.fn(),
    markAllAsReadSecureMock: vi.fn(),
    deleteNotificationSecureMock: vi.fn(),
    savePushTokenSecureMock: vi.fn(),
}));

vi.mock('@/actions/notifications-v2', () => ({
    getNotificationsSecure: mocks.getNotificationsSecureMock,
    markAsReadSecure: mocks.markAsReadSecureMock,
    markAllAsReadSecure: mocks.markAllAsReadSecureMock,
    deleteNotificationSecure: mocks.deleteNotificationSecureMock,
    savePushTokenSecure: mocks.savePushTokenSecureMock,
}));

import { useNotificationStore } from '@/presentation/store/useNotificationStore';

describe('useNotificationStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useNotificationStore.setState({
            notifications: [],
            unreadCount: 0,
            isOpen: false,
            isLoading: false,
            error: null,
            activeCategory: 'ALL',
            lastFetchedKey: null,
            lastFetchedAt: null,
            selectedIds: new Set(),
        });
    });

    it('deduplica fetches concurrentes para la misma ubicación', async () => {
        let resolveFetch: (value: { success: boolean; data: unknown[]; unreadCount: number }) => void = () => {
            throw new Error('Resolver no inicializado');
        };
        const pendingFetch = new Promise<{ success: boolean; data: unknown[]; unreadCount: number }>((resolve) => {
            resolveFetch = resolve;
        });

        mocks.getNotificationsSecureMock.mockReturnValue(pendingFetch);

        const firstFetch = useNotificationStore.getState().fetchNotifications('loc-1');
        const secondFetch = useNotificationStore.getState().fetchNotifications('loc-1');

        expect(mocks.getNotificationsSecureMock).toHaveBeenCalledTimes(1);

        resolveFetch({ success: true, data: [], unreadCount: 0 });
        await Promise.all([firstFetch, secondFetch]);
    });

    it('evita refetch inmediato si la cache local sigue fresca', async () => {
        mocks.getNotificationsSecureMock.mockResolvedValue({
            success: true,
            data: [],
            unreadCount: 0,
        });

        await useNotificationStore.getState().fetchNotifications('loc-1');
        await useNotificationStore.getState().fetchNotifications('loc-1');

        expect(mocks.getNotificationsSecureMock).toHaveBeenCalledTimes(1);
    });

    it('permite forzar refresh aunque la cache siga fresca', async () => {
        mocks.getNotificationsSecureMock.mockResolvedValue({
            success: true,
            data: [],
            unreadCount: 0,
        });

        await useNotificationStore.getState().fetchNotifications('loc-1');
        await useNotificationStore.getState().fetchNotifications('loc-1', { force: true });

        expect(mocks.getNotificationsSecureMock).toHaveBeenCalledTimes(2);
    });
});
