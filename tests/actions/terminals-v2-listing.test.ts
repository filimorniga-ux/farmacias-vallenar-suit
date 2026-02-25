import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        connect: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { getTerminalsByLocationSecure } from '@/actions/terminals-v2';

describe('Terminals V2 - getTerminalsByLocationSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should query active session via LATERAL and include session_id in response', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: '550e8400-e29b-41d4-a716-446655440010',
                    name: 'Caja 1 stgo',
                    location_id: '550e8400-e29b-41d4-a716-446655440011',
                    status: 'OPEN',
                    current_cashier_id: '550e8400-e29b-41d4-a716-446655440012',
                    session_id: '550e8400-e29b-41d4-a716-446655440013',
                    current_cashier_name: 'Gerente General 1',
                    is_active: true,
                },
            ],
        });

        const res = await getTerminalsByLocationSecure('550e8400-e29b-41d4-a716-446655440011');

        expect(res.success).toBe(true);
        expect(res.data?.[0]?.session_id).toBe('550e8400-e29b-41d4-a716-446655440013');

        const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('LEFT JOIN LATERAL');
        expect(sql).toContain('s.session_id');
        expect(sql).toContain("WHEN t.status = 'OPEN' AND s.session_id IS NULL THEN 'CLOSED'");
        expect(sql).toContain('u.id::text');
        expect(params).toEqual(['550e8400-e29b-41d4-a716-446655440011']);
    });

    it('should fetch all active terminals when location is omitted', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await getTerminalsByLocationSecure();

        expect(res.success).toBe(true);
        const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('WHERE t.is_active = true AND t.deleted_at IS NULL');
        expect(params).toEqual([]);
    });
});
