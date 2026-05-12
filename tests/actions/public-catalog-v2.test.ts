/**
 * Tests - Public Catalog V2 Module
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockLogger, mockNoStore, mockState } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    mockNoStore: vi.fn(),
    mockState: {
        currentIp: '192.168.1.1',
    },
}));

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));
vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-forwarded-for', mockState.currentIp]])),
}));
vi.mock('next/cache', () => ({
    unstable_noStore: mockNoStore,
}));
vi.mock('@/lib/logger', () => ({ logger: mockLogger }));

import * as publicCatalogV2 from '@/actions/public-catalog-v2';

const validLocationId = '550e8400-e29b-41d4-a716-446655440000';

describe('Public Catalog V2 - Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.currentIp = `192.168.1.${Math.floor(Math.random() * 200) + 1}`;
        mockQuery.mockResolvedValue({ rows: [] });
    });

    it('should require minimum 3 characters', async () => {
        const result = await publicCatalogV2.checkProductPriceSecure(
            'ab',
            validLocationId
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('3 caracteres');
        expect(mockNoStore).toHaveBeenCalledTimes(1);
    });

    it('should validate location UUID', async () => {
        const result = await publicCatalogV2.checkProductPriceSecure(
            'paracetamol',
            'invalid-uuid'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválida');
    });

    it('should validate location UUID before loading categories', async () => {
        const result = await publicCatalogV2.getPublicCategoriesSecure('invalid-uuid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválida');
        expect(mockNoStore).toHaveBeenCalledTimes(1);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('should validate location UUID before loading promotions', async () => {
        const result = await publicCatalogV2.getPromotionsSecure('invalid-uuid');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválida');
        expect(mockNoStore).toHaveBeenCalledTimes(1);
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

describe('Public Catalog V2 - Rate Limiting', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.currentIp = '192.168.1.250';
        mockQuery.mockResolvedValue({ rows: [] });
    });

    it('should rate limit excessive public catalog lookups before querying DB', async () => {
        for (let i = 0; i < 30; i++) {
            await publicCatalogV2.getPublicCategoriesSecure(validLocationId);
        }

        const limited = await publicCatalogV2.getPublicCategoriesSecure(validLocationId);

        expect(limited.success).toBe(false);
        expect(limited.error).toContain('Demasiadas consultas');
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockNoStore).toHaveBeenCalledTimes(31);
    });
});
