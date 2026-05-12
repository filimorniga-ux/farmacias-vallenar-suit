import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockLogger, mockNoStore } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLogger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
    mockNoStore: vi.fn(),
}));

let currentIp = '198.51.100.1';

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
}));

vi.mock('@/lib/logger', () => ({
    logger: mockLogger,
}));

vi.mock('next/cache', () => ({
    unstable_noStore: mockNoStore,
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => ({
        get: (name: string) => {
            if (name.toLowerCase() === 'x-forwarded-for') return currentIp;
            return null;
        },
    })),
}));

import { browseProductsAction } from '@/actions/public/browse-products';
import { matchActiveIngredientAction } from '@/actions/public/match-active-ingredient';
import { searchProductsAction } from '@/actions/public/search-products';
import {
    normalizePublicSearchLimit,
    normalizePublicSearchPage,
    normalizePublicSearchTerm,
    resetPublicSearchRateLimitsForTests,
} from '@/actions/public/public-search-guard';

describe('public price checker actions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetPublicSearchRateLimitsForTests();
        currentIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
        mockQuery.mockResolvedValue({ rows: [] });
    });

    it('normaliza términos públicos y limita paginación antes de armar queries', () => {
        const normalized = normalizePublicSearchTerm('  Paracetamol <script>alert(1)</script>  '.repeat(5));

        expect(normalized.length).toBeLessThanOrEqual(100);
        expect(normalized).not.toContain('<');
        expect(normalized).not.toContain('>');
        expect(normalizePublicSearchPage(-50)).toBe(1);
        expect(normalizePublicSearchLimit(500)).toBe(50);
    });

    it('aplica no-store y usa término sanitizado en búsqueda de productos', async () => {
        await searchProductsAction('  Paracetamol <script> ');

        expect(mockNoStore).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        const params = mockQuery.mock.calls[0][1];

        expect(params).toEqual(['%Paracetamol script%']);
    });

    it('caps de letter/page/limit en browsing público', async () => {
        await browseProductsAction('abcdef<script>', -10, 500);

        expect(mockNoStore).toHaveBeenCalledTimes(1);
        expect(mockQuery).toHaveBeenCalledTimes(1);
        const params = mockQuery.mock.calls[0][1];

        expect(params).toEqual(['a%', 50, 0]);
    });

    it('aplica rate limit por IP antes de consultar DB', async () => {
        currentIp = '198.51.100.250';
        mockQuery.mockResolvedValue({ rows: [{ active_ingredient: 'PARACETAMOL' }] });

        for (let i = 0; i < 30; i++) {
            await matchActiveIngredientAction(`Paracetamol ${i}`);
        }

        const limited = await matchActiveIngredientAction('Paracetamol limitado');

        expect(limited).toBeNull();
        expect(mockQuery).toHaveBeenCalledTimes(30);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            { ip: '198.51.100.250', namespace: 'match-active-ingredient' },
            '[PublicSearch] Rate limit exceeded',
        );
    });
});
