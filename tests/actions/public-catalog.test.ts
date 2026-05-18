import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery, mockLogger, mockNoStore, mockState } = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockLogger: {
        warn: vi.fn(),
        error: vi.fn(),
    },
    mockNoStore: vi.fn(),
    mockState: {
        currentIp: '198.51.100.1',
    },
}));

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
            if (name.toLowerCase() === 'x-forwarded-for') return mockState.currentIp;
            return null;
        },
    })),
}));

import { checkProductPrice } from '@/actions/public-catalog';

describe('public-catalog SQL contract', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState.currentIp = `198.51.100.${Math.floor(Math.random() * 200) + 1}`;
    });

    it('rechaza entradas insuficientes antes de consultar DB', async () => {
        const result = await checkProductPrice('pa', '550e8400-e29b-41d4-a716-446655440001');

        expect(result.success).toBe(false);
        expect(mockNoStore).toHaveBeenCalledTimes(1);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('rechaza locationId inválido antes de consultar DB', async () => {
        const result = await checkProductPrice('paracetamol', 'loc-1');

        expect(result.success).toBe(false);
        expect(result.error).toContain('sucursal');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('busca por barcode sin exigir columna fisica en inventory_batches', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const result = await checkProductPrice('  780<script>  ', '550e8400-e29b-41d4-a716-446655440001');

        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("NULLIF(to_jsonb(ib)->>'barcode', '') = $3"),
            ['%780script%', '550e8400-e29b-41d4-a716-446655440001', '780script'],
        );
        const sql = String(mockQuery.mock.calls[0][0]);
        expect(sql).not.toMatch(/\bib\.barcode\b/);
        expect(sql).toContain('is_visible');
    });

    it('aplica rate limit antes de consultar DB', async () => {
        mockState.currentIp = '198.51.100.250';
        mockQuery.mockResolvedValue({ rows: [] });

        for (let i = 0; i < 30; i++) {
            await checkProductPrice(`paracetamol ${i}`, '550e8400-e29b-41d4-a716-446655440001');
        }

        const limited = await checkProductPrice('paracetamol limitado', '550e8400-e29b-41d4-a716-446655440001');

        expect(limited.success).toBe(false);
        expect(limited.error).toContain('Demasiadas consultas');
        expect(mockQuery).toHaveBeenCalledTimes(30);
        expect(mockLogger.warn).toHaveBeenCalledWith(
            { ip: '198.51.100.250' },
            '[PublicCatalogLegacy] Rate limit exceeded',
        );
    });
});
