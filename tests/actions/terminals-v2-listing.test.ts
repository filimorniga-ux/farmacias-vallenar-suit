import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetValidatedSession = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        connect: vi.fn(),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: (...args: unknown[]) => mockGetValidatedSession(...args),
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

import { getActiveSession, getTerminalsByLocationSecure } from '@/actions/terminals-v2';

const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440011';
const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440099';
const VALID_TERMINAL_ID = '550e8400-e29b-41d4-a716-446655440010';

describe('Terminals V2 - getTerminalsByLocationSecure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440012',
            role: 'ADMIN',
            locationId: VALID_LOCATION_ID,
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token-1',
        });
    });

    it('should query active session via LATERAL and include session_id in response', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: VALID_TERMINAL_ID,
                    name: 'Caja 1 stgo',
                    location_id: VALID_LOCATION_ID,
                    status: 'OPEN',
                    current_cashier_id: '550e8400-e29b-41d4-a716-446655440012',
                    session_id: '550e8400-e29b-41d4-a716-446655440013',
                    current_cashier_name: 'Gerente General 1',
                    is_active: true,
                },
            ],
        });

        const res = await getTerminalsByLocationSecure(VALID_LOCATION_ID);

        expect(res.success).toBe(true);
        expect(res.data?.[0]?.session_id).toBe('550e8400-e29b-41d4-a716-446655440013');

        const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('LEFT JOIN LATERAL');
        expect(sql).toContain('s.session_id');
        expect(sql).toContain("WHEN t.status = 'OPEN' AND s.session_id IS NULL THEN 'CLOSED'");
        expect(sql).toContain('u.id::text');
        expect(params).toEqual([VALID_LOCATION_ID]);
    });

    it('should fetch all active terminals when location is omitted', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await getTerminalsByLocationSecure();

        expect(res.success).toBe(true);
        const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('WHERE t.is_active = true AND t.deleted_at IS NULL');
        expect(params).toEqual([]);
    });

    it('scopes omitted location to actor location for cashier roles', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440012',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            userName: 'Caja 1',
            tokenVersion: 1,
            sessionToken: 'token-2',
        });
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await getTerminalsByLocationSecure();

        expect(res.success).toBe(true);
        const [, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(params).toEqual([VALID_LOCATION_ID]);
    });

    it('rejects access without authenticated session', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        const res = await getTerminalsByLocationSecure(VALID_LOCATION_ID);

        expect(res.success).toBe(false);
        expect(res.error).toContain('autenticado');
        expect(mockQuery).not.toHaveBeenCalled();
    });
});

describe('Terminals V2 - getActiveSession', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440012',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            userName: 'Caja 1',
            tokenVersion: 1,
            sessionToken: 'token-3',
        });
    });

    it('denies terminal access outside actor scope', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [
                {
                    id: VALID_TERMINAL_ID,
                    location_id: OTHER_LOCATION_ID,
                    current_cashier_id: null,
                    status: 'OPEN',
                },
            ],
        });

        const res = await getActiveSession(VALID_TERMINAL_ID);

        expect(res.success).toBe(false);
        expect(res.error).toContain('otra ubicación');
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });
});
