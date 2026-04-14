import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as notificationsV2 from '@/actions/notifications-v2';
import { getValidatedSession } from '@/lib/server-session';
import { getClient } from '@/lib/db';

const { mockClient } = vi.hoisted(() => ({
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn().mockResolvedValue(mockClient),
    },
    getClient: vi.fn().mockResolvedValue(mockClient),
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

describe('Notifications V2 - server-side session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockClient.query.mockReset();
        mockClient.release.mockReset();
    });

    it('rechaza getNotificationsSecure sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await notificationsV2.getNotificationsSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('rechaza markAsReadSecure sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await notificationsV2.markAsReadSecure(['550e8400-e29b-41d4-a716-446655440000']);

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('retorna 0 en getUnreadCountSecure si no hay sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await notificationsV2.getUnreadCountSecure('550e8400-e29b-41d4-a716-446655440000');

        expect(result).toBe(0);
        expect(getClient).not.toHaveBeenCalled();
    });

    it('fuerza el scope de notificaciones a la ubicación efectiva de la sesión', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440010',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        mockClient.query
            .mockResolvedValueOnce({ rows: [], rowCount: 0 })
            .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });

        const result = await notificationsV2.getNotificationsSecure('550e8400-e29b-41d4-a716-446655440099');

        expect(result.success).toBe(true);
        const fetchCall = mockClient.query.mock.calls[0];
        expect(String(fetchCall[0])).toContain('notification_reads');
        expect(fetchCall[1]).toContain('550e8400-e29b-41d4-a716-446655440010');
        expect(fetchCall[1]).not.toContain('550e8400-e29b-41d4-a716-446655440099');
    });

    it('mantiene createNotificationSecure como flujo de sistema sin sesión', async () => {
        mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await notificationsV2.createNotificationSecure({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            title: '<script>alert(\"XSS\")</script>Importante',
            message: '<img src=x onerror=alert(\"XSS\")>Mensaje',
            type: 'SYSTEM',
        });

        expect(result.success).toBe(true);
        expect(getValidatedSession).not.toHaveBeenCalled();

        const insertCall = mockClient.query.mock.calls.find((call) =>
            typeof call[0] === 'string' && call[0].includes('INSERT INTO notifications')
        );

        expect(insertCall).toBeDefined();
        if (!insertCall) return;
        expect(insertCall[1][3]).not.toContain('<script>');
        expect(insertCall[1][4]).not.toContain('<img');
    });

    it('exige rol ADMIN para deleteOldNotifications', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await notificationsV2.deleteOldNotifications(30);

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('permite validar el mínimo de retención con sesión admin', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await notificationsV2.deleteOldNotifications(3);

        expect(result.success).toBe(false);
        expect(result.error).toContain('7 días');
    });

    it('retorna error controlado si falla obtener el cliente al leer notificaciones', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(getClient).mockRejectedValueOnce(new Error('Connection terminated due to connection timeout'));

        const result = await notificationsV2.getNotificationsSecure('550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Failed to fetch notifications');
    });

    it('markAsReadSecure opera sobre notification_reads y no muta notifications globales', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440010',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockClient.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });

        const result = await notificationsV2.markAsReadSecure(['550e8400-e29b-41d4-a716-446655440000']);

        expect(result.success).toBe(true);
        expect(String(mockClient.query.mock.calls[0]?.[0])).toContain('INSERT INTO notification_reads');
        expect(String(mockClient.query.mock.calls[0]?.[0])).not.toContain('UPDATE notifications SET is_read = TRUE');
    });

    it('deleteNotificationSecure hace soft-delete por usuario en notification_reads', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440010',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockClient.query.mockResolvedValueOnce({ rows: [{ count: 1 }], rowCount: 1 });

        const result = await notificationsV2.deleteNotificationSecure(['550e8400-e29b-41d4-a716-446655440000']);

        expect(result.success).toBe(true);
        expect(result.deletedCount).toBe(1);
        expect(String(mockClient.query.mock.calls[0]?.[0])).toContain('INSERT INTO notification_reads');
        expect(String(mockClient.query.mock.calls[0]?.[0])).not.toContain('DELETE FROM notifications');
    });
});
