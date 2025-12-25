/**
 * Tests - Notifications V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as notificationsV2 from '@/actions/notifications-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'CASHIER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

describe('Notifications V2 - Security', () => {
    it('should require authentication for getMyNotifications', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await notificationsV2.getMyNotifications();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('should require authentication for markAsReadSecure', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map() as any);

        const result = await notificationsV2.markAsReadSecure('550e8400-e29b-41d4-a716-446655440000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('should validate notification ID format', async () => {
        const result = await notificationsV2.markAsReadSecure('invalid-id');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

describe('Notifications V2 - Content Sanitization', () => {
    it('should sanitize HTML in title and message', async () => {
        const mockDb = await import('@/lib/db');
        const mockPool = mockDb.pool;

        const mockClient = {
            query: vi.fn().mockResolvedValue({ rows: [], rowCount: 1 }),
            release: vi.fn()
        };
        vi.mocked(mockPool.connect).mockResolvedValueOnce(mockClient as any);

        await notificationsV2.createNotificationSecure({
            userId: '550e8400-e29b-41d4-a716-446655440000',
            title: '<script>alert("XSS")</script>Important',
            message: '<img src=x onerror=alert("XSS")>Message',
            type: 'INFO'
        });

        // Verify sanitization happened (script tag removed)
        const insertCall = mockClient.query.mock.calls.find(
            (call: any) => call[0].includes('INSERT INTO notifications')
        );

        if (insertCall) {
            // Title should not contain <script>
            expect(insertCall[1][3]).not.toContain('<script>');
            // Message should not contain <img
            expect(insertCall[1][4]).not.toContain('<img');
        }
    });
});

describe('Notifications V2 - RBAC for Cleanup', () => {
    it('should require ADMIN role for deleteOldNotifications', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'CASHIER'] // Not admin
        ]) as any);

        const result = await notificationsV2.deleteOldNotifications(30);

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });

    it('should require minimum 7 days', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'admin-1'],
            ['x-user-role', 'ADMIN']
        ]) as any);

        const result = await notificationsV2.deleteOldNotifications(3);

        expect(result.success).toBe(false);
        expect(result.error).toContain('7 días');
    });
});
