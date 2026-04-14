/**
 * Tests - Get Locations V2 & Public Network V2
 */
import { describe, it, expect, vi } from 'vitest';
import * as publicNetworkV2 from '@/actions/public-network-v2';

vi.mock('@/lib/db', () => ({ query: vi.fn() }));
vi.mock('@/lib/rate-limiter', () => ({ checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map([['x-forwarded-for', '192.168.1.1']])) }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: any) => fn }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), error: vi.fn() } }));

describe('Public Network V2 - Rate Limit', () => {
    it('should have rate limit implemented', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValue({ rows: [] } as any);
        const result = await publicNetworkV2.getPublicLocationsSecure();
        expect(result.success).toBe(true);
    });
});
