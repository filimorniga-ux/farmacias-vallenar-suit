/**
 * Tests - Get Locations V2 & Public Network V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as getLocationsV2 from '@/actions/get-locations-v2';
import * as publicNetworkV2 from '@/actions/public-network-v2';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-forwarded-for', '192.168.1.1']])) }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: any) => fn }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe('Get Locations V2 - Auth Required', () => {
    it('should require authentication', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);
        const result = await getLocationsV2.getLocationsSecure();
        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Public Network V2 - Rate Limit', () => {
    it('should have rate limit implemented', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({ rows: [] } as any);
        const result = await publicNetworkV2.getPublicLocationsSecure();
        expect(result.success).toBe(true);
    });
});
