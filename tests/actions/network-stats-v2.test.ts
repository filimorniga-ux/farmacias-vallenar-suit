/**
 * Tests - Network Stats V2 Module
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import * as networkStatsV2 from '@/actions/network-stats-v2';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getValidatedSession).mockResolvedValue({
        userId: 'user-1',
        role: 'MANAGER',
        locationId: '550e8400-e29b-41d4-a716-446655440000',
        userName: 'Manager',
        tokenVersion: 1,
        sessionToken: 'token',
    });
});

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
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'MANAGER',
            locationId: '550e8400-e29b-41d4-a716-446655440000',
            userName: 'Manager',
            tokenVersion: 1,
            sessionToken: 'token',
        });

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
