import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockGetValidatedSession = vi.fn();
const mockGetClient = vi.fn();
const mockRelease = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    getClient: (...args: unknown[]) => mockGetClient(...args),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: (...args: unknown[]) => mockGetValidatedSession(...args),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { getShiftDetails, getShiftHistory, reopenShift } from '@/actions/history-v2';

const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440040';
const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440099';
const VALID_TERMINAL_ID = '550e8400-e29b-41d4-a716-446655440030';
const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440020';

describe('History V2 - POS scope hardening', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetValidatedSession.mockResolvedValue({
            userId: '550e8400-e29b-41d4-a716-446655440010',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token-1',
        });
        mockGetClient.mockResolvedValue({
            query: mockQuery,
            release: mockRelease,
        });
    });

    it('getShiftHistory fuerza el scope del actor cuando no se envía locationId', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [] });

        const res = await getShiftHistory({ limit: 20 });

        expect(res.success).toBe(true);
        const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
        expect(sql).toContain('t.location_id = $1');
        expect(params).toEqual([VALID_LOCATION_ID, 20]);
    });

    it('getShiftDetails rechaza sesiones fuera de la sucursal del actor', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{
                id: VALID_SESSION_ID,
                terminal_id: VALID_TERMINAL_ID,
                user_id: '550e8400-e29b-41d4-a716-446655440010',
                status: 'OPEN',
                closed_at: null,
                location_id: OTHER_LOCATION_ID,
            }],
        });

        const res = await getShiftDetails(VALID_SESSION_ID);

        expect(res.success).toBe(false);
        expect(res.error).toContain('otra ubicación');
        expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('reopenShift exige rol supervisor antes de abrir el flujo transaccional', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: '550e8400-e29b-41d4-a716-446655440010',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token-2',
        });

        const res = await reopenShift(VALID_SESSION_ID);

        expect(res.success).toBe(false);
        expect(res.error).toContain('Acceso denegado');
        expect(mockGetClient).not.toHaveBeenCalled();
    });
});
