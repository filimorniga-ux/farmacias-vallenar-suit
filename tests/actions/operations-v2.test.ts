import { beforeEach, describe, expect, it, vi } from 'vitest';

const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const PAYLOAD_USER_ID = '550e8400-e29b-41d4-a716-446655440010';
const SESSION_USER_ID = '550e8400-e29b-41d4-a716-446655440011';
const VALID_COUNTER_ID = 7;

const {
    mockQuery,
    mockRelease,
    mockConnect,
    mockGetActorOrFail,
    mockValidatePinForRoles,
    mockEnsureCheckInSecure,
    PinRbacErrorMock,
} = vi.hoisted(() => {
    class PinRbacErrorMock extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockQuery: vi.fn(),
        mockRelease: vi.fn(),
        mockConnect: vi.fn(),
        mockGetActorOrFail: vi.fn(),
        mockValidatePinForRoles: vi.fn(),
        mockEnsureCheckInSecure: vi.fn(),
        PinRbacErrorMock,
    };
});

vi.mock('@/lib/db', () => ({
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
    },
    query: vi.fn(),
}));

vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    ROLE_GROUPS: {
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError: PinRbacErrorMock,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/actions/attendance-v2', () => ({
    ensureCheckInSecure: (...args: unknown[]) => mockEnsureCheckInSecure(...args),
}));
vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => 'new-uuid') }));

import {
    callNextTicketSecure,
    clockInSecure,
    clockOutSecure,
    closeShiftSecure,
    getShiftStatusSecure,
    openShiftSecure,
} from '@/actions/operations-v2';

describe('operations-v2 session-backed auth contracts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetActorOrFail.mockResolvedValue({
            userId: SESSION_USER_ID,
            userName: 'Actor Sesion',
            role: 'CASHIER',
            locationId: VALID_LOCATION_ID,
            tokenVersion: 1,
            sessionToken: 'session-token',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: '550e8400-e29b-41d4-a716-446655440099',
                name: 'Supervisor PIN',
                role: 'MANAGER',
            },
        });
        mockEnsureCheckInSecure.mockResolvedValue(false);
    });

    it('getShiftStatusSecure valida locationId', async () => {
        const result = await getShiftStatusSecure('invalid-id');
        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });

    it('openShiftSecure usa actor de sesión y deja el autorizador del PIN como metadato', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await openShiftSecure({
            userId: PAYLOAD_USER_ID,
            locationId: VALID_LOCATION_ID,
            managerPin: '1234',
        });

        expect(result.success).toBe(true);
        expect(mockValidatePinForRoles).toHaveBeenCalledOnce();
        expect(mockEnsureCheckInSecure).toHaveBeenCalledWith(SESSION_USER_ID, VALID_LOCATION_ID);

        const insertShiftCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO shift_status')
        );
        expect(insertShiftCall?.[1]).toEqual([VALID_LOCATION_ID, SESSION_USER_ID]);

        const auditCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe(SESSION_USER_ID);
        const auditPayload = JSON.parse(String(auditCall?.[1]?.[3] || '{}')) as Record<string, unknown>;
        expect(auditPayload.opened_by).toBe('Actor Sesion');
        expect(auditPayload.authorized_by_id).toBe('550e8400-e29b-41d4-a716-446655440099');
    });

    it('closeShiftSecure usa actor de sesión y no el userId del payload', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rowCount: 1, rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await closeShiftSecure(PAYLOAD_USER_ID, VALID_LOCATION_ID, '1234');

        expect(result.success).toBe(true);
        const updateCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('UPDATE shift_status')
        );
        expect(updateCall?.[1]).toEqual([VALID_LOCATION_ID, SESSION_USER_ID]);
    });

    it('clockInSecure ignora userId spoofeado y registra asistencia con actor de sesión', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await clockInSecure({
            userId: PAYLOAD_USER_ID,
            locationId: VALID_LOCATION_ID,
            method: 'PIN',
        });

        expect(result.success).toBe(true);

        const insertAttendanceCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes("INSERT INTO attendance_logs (id, user_id, type, location_id, method, timestamp)")
        );
        expect(insertAttendanceCall?.[1]).toEqual(['new-uuid', SESSION_USER_ID, VALID_LOCATION_ID, 'PIN']);

        const auditCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe(SESSION_USER_ID);
    });

    it('clockOutSecure usa actor de sesión aunque llegue otro userId válido por payload', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'checkin-id', timestamp: new Date('2026-03-30T12:00:00.000Z') }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await clockOutSecure(PAYLOAD_USER_ID, VALID_LOCATION_ID);

        expect(result.success).toBe(true);
        const selectCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('SELECT id, timestamp FROM attendance_logs')
        );
        expect(selectCall?.[1]).toEqual([SESSION_USER_ID]);
    });

    it('callNextTicketSecure persiste called_by y auditoría con actor de sesión', async () => {
        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', ticket_number: 'A-001' }] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await callNextTicketSecure(VALID_COUNTER_ID, PAYLOAD_USER_ID);

        expect(result.success).toBe(true);
        const updateCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('UPDATE queue_tickets')
        );
        expect(updateCall?.[1]).toEqual([VALID_COUNTER_ID, 'ticket-1', SESSION_USER_ID]);

        const auditCall = mockQuery.mock.calls.find((call) =>
            String(call[0]).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1]?.[0]).toBe(SESSION_USER_ID);
    });

    it('rechaza apertura de turno sin sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValueOnce(
            new PinRbacErrorMock('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await openShiftSecure({
            userId: PAYLOAD_USER_ID,
            locationId: VALID_LOCATION_ID,
            managerPin: '1234',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Sesión no válida');
        expect(mockConnect).not.toHaveBeenCalled();
    });
});
