import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockQuery,
    mockClientQuery,
    mockRelease,
    mockCheckRateLimit,
    mockRecordFailedAttempt,
    mockResetAttempts,
    mockGetActorOrFail,
    mockRequireRole,
    mockValidatePinForRoles,
    mockValidatePinForUser,
    PinRbacError,
} = vi.hoisted(() => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        mockQuery: vi.fn(),
        mockClientQuery: vi.fn(),
        mockRelease: vi.fn(),
        mockCheckRateLimit: vi.fn(),
        mockRecordFailedAttempt: vi.fn(),
        mockResetAttempts: vi.fn(),
        mockGetActorOrFail: vi.fn(),
        mockRequireRole: vi.fn(),
        mockValidatePinForRoles: vi.fn(),
        mockValidatePinForUser: vi.fn(),
        PinRbacError: MockPinRbacError,
    };
});

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        connect: vi.fn(() => Promise.resolve({
            query: mockClientQuery,
            release: mockRelease,
        })),
    },
}));

vi.mock('@/lib/pin-rbac', () => ({
    PinRbacError,
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
        MANAGER_OR_HR: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'],
        OVERRIDE: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'],
        TREASURY_AUTH: ['ADMIN', 'MANAGER', 'GERENTE_GENERAL', 'TESORERO'],
    },
    getActorOrFail: (...args: unknown[]) => mockGetActorOrFail(...args),
    requireRole: (...args: unknown[]) => mockRequireRole(...args),
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    validatePinForUser: (...args: unknown[]) => mockValidatePinForUser(...args),
}));

vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
    recordFailedAttempt: (...args: unknown[]) => mockRecordFailedAttempt(...args),
    resetAttempts: (...args: unknown[]) => mockResetAttempts(...args),
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Map([['x-forwarded-for', '127.0.0.1']])),
    cookies: vi.fn(async () => ({ get: vi.fn(() => undefined) })),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999'),
}));

import * as attendanceV2 from '@/actions/attendance-v2';
import { PinRbacError as ImportedPinRbacError } from '@/lib/pin-rbac';

const ACTOR_ID = '550e8400-e29b-41d4-a716-446655440010';
const MANAGER_ID = '550e8400-e29b-41d4-a716-446655440011';
const EMPLOYEE_ID = '550e8400-e29b-41d4-a716-446655440012';
const ATTENDANCE_ID = '550e8400-e29b-41d4-a716-446655440013';

function setActor(role: string = 'CASHIER') {
    mockGetActorOrFail.mockResolvedValue({
        userId: ACTOR_ID,
        role,
        locationId: 'loc-1',
        userName: 'Actor',
        tokenVersion: 1,
        sessionToken: 'session-token',
    });

    mockRequireRole.mockImplementation((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new ImportedPinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }

        return actor;
    });
}

describe('attendance-v2 shared PIN/RBAC contracts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActor();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockClientQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockCheckRateLimit.mockReturnValue({ allowed: true });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: MANAGER_ID,
                name: 'Manager',
                role: 'MANAGER',
            },
            matchedBy: 'hash',
        });
        mockValidatePinForUser.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: EMPLOYEE_ID,
                name: 'Empleado',
                role: 'CASHIER',
            },
            matchedBy: 'hash',
        });
    });

    it('rechaza getMyAttendanceHistory sin sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValue(
            new ImportedPinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await attendanceV2.getMyAttendanceHistory();

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('rechaza getTeamAttendanceHistory con rol insuficiente', async () => {
        setActor('CASHIER');

        const result = await attendanceV2.getTeamAttendanceHistory();

        expect(result.success).toBe(false);
        expect(result.error).toContain('managers');
    });

    it('validateEmployeePinSecure usa el helper compartido y permite la excepción de desarrollo vía opciones', async () => {
        const result = await attendanceV2.validateEmployeePinSecure(EMPLOYEE_ID, '1213');

        expect(result.success).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.employeeName).toBe('Empleado');
        expect(mockValidatePinForUser).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.any(Function) }),
            EMPLOYEE_ID,
            '1213',
            expect.objectContaining({
                allowLegacyPlaintext: true,
                allowDevelopmentMasterPin: true,
            })
        );
    });

    it('approveOvertimeSecure audita con el actor de sesión y no con el autorizador del PIN', async () => {
        setActor('MANAGER');
        mockClientQuery.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 };
            }

            if (sql.includes('UPDATE attendance_logs')) {
                return { rows: [], rowCount: 1 };
            }

            if (sql.includes('INSERT INTO audit_log')) {
                return { rows: [], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
        });

        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: MANAGER_ID,
                name: 'Supervisor PIN',
                role: 'MANAGER',
            },
            matchedBy: 'hash',
        });

        const result = await attendanceV2.approveOvertimeSecure({
            attendanceId: ATTENDANCE_ID,
            managerPin: '9999',
            approved: true,
            notes: 'Autorizado',
        });

        expect(result.success).toBe(true);

        const updateCall = mockClientQuery.mock.calls.find(([sql]) =>
            String(sql).includes('UPDATE attendance_logs')
        );
        expect(updateCall?.[1][2]).toBe(ACTOR_ID);

        const auditCall = mockClientQuery.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1][0]).toBe(ACTOR_ID);
        expect(JSON.parse(String(auditCall?.[1][2]))).toMatchObject({
            approved: true,
            notes: 'Autorizado',
            authorized_by: 'Supervisor PIN',
        });
    });

    it('validateKioskExitPin usa el helper compartido con rate limit externo por IP', async () => {
        const result = await attendanceV2.validateKioskExitPin('1213');

        expect(result.valid).toBe(true);
        expect(mockCheckRateLimit).toHaveBeenCalledWith('kiosk_exit_127.0.0.1');
        expect(mockValidatePinForRoles).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.any(Function) }),
            '1213',
            ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'RRHH'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                allowDevelopmentMasterPin: true,
                useRateLimiter: false,
            })
        );
        expect(mockResetAttempts).toHaveBeenCalledWith('kiosk_exit_127.0.0.1');
    });
});
