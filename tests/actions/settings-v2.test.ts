/**
 * Tests - Settings V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as settingsV2 from '@/actions/settings-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-user-id', 'user-1'], ['x-user-role', 'MANAGER']]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Settings V2 - Public Settings', () => {
    it('should allow public settings without auth', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValueOnce({
            rows: [{ value: 'Farmacia Vallenar' }],
            rowCount: 1
        } as any);

        const result = await settingsV2.getPublicSettingSecure('STORE_NAME');

        expect(result.success).toBe(true);
        expect(result.value).toBe('Farmacia Vallenar');
    });

    it('should reject non-public settings', async () => {
        const result = await settingsV2.getPublicSettingSecure('ADMIN_EMAIL');

        expect(result.success).toBe(false);
        expect(result.error).toContain('públicamente');
    });
});

describe('Settings V2 - RBAC', () => {
    it('should require admin role for all settings list', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER'] // Not admin
        ]) as any);

        const result = await settingsV2.getAllSettingsSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });
});

describe('Settings V2 - Critical Settings', () => {
    it('should require PIN for critical settings update', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'admin-1'],
            ['x-user-role', 'ADMIN']
        ]) as any);

        const result = await settingsV2.updateSettingSecure(
            'SII_CERT_PASSWORD',
            'new-password'
            // No PIN provided
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});
