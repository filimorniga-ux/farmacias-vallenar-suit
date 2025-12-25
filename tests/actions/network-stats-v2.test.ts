/**
 * Tests - Network Stats V2 Module
 */

import { describe, it, expect, vi } from 'vitest';
import * as networkStatsV2 from '@/actions/network-stats-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([
        ['x-user-id', 'user-1'],
        ['x-user-role', 'MANAGER'],
        ['x-user-location', '550e8400-e29b-41d4-a716-446655440000']
    ]))
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Network Stats V2 - Location RBAC', () => {
    it('should restrict MANAGER to their location only', async () => {
        const result = await networkStatsV2.getLocationHealthSecure(
            '550e8400-e29b-41d4-a716-446655440001' // Different location
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('ubicación');
    });
});

describe('Network Stats V2 - Network Overview', () => {
    it('should require ADMIN for network overview', async () => {
        const mockHeaders = await import('next/headers');
        vi.mocked(mockHeaders.headers).mockResolvedValueOnce(new Map([
            ['x-user-id', 'user-1'],
            ['x-user-role', 'MANAGER']
        ]) as any);

        const result = await networkStatsV2.getNetworkOverviewSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('administradores');
    });
});

describe('Network Stats V2 - Validation', () => {
    it('should validate UUID format', async () => {
        const result = await networkStatsV2.getLocationHealthSecure('invalid');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});
