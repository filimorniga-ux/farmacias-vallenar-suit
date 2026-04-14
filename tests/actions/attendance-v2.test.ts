import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockQuery,
    mockClientQuery,
    mockRelease,
    mockGetActorOrFail,
    mockRequireRole,
    mockValidatePinForRoles,
    mockValidatePinForUser,
    mockVerifyKioskSessionToken,
    mockValidateAttendanceKioskExitPinSecure,
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
        mockGetActorOrFail: vi.fn(),
        mockRequireRole: vi.fn(),
        mockValidatePinForRoles: vi.fn(),
        mockValidatePinForUser: vi.fn(),
        mockVerifyKioskSessionToken: vi.fn(),
        mockValidateAttendanceKioskExitPinSecure: vi.fn(),
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

vi.mock('@/lib/kiosk-session', () => ({
    verifyKioskSessionToken: (...args: unknown[]) => mockVerifyKioskSessionToken(...args),
}));

vi.mock('@/actions/kiosk-auth-v2', () => ({
    validateAttendanceKioskExitPinSecure: (...args: unknown[]) => mockValidateAttendanceKioskExitPinSecure(...args),
}));

vi.mock('next/headers', () => ({
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
const LOCATION_ID = '550e8400-e29b-41d4-a716-446655440020';
const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440021';

function setActor(role: string = 'CASHIER') {
    mockGetActorOrFail.mockResolvedValue({
        userId: ACTOR_ID,
        role,
        locationId: LOCATION_ID,
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
        mockVerifyKioskSessionToken.mockReturnValue({
            valid: true,
            payload: {
                version: 1,
                mode: 'ATTENDANCE',
                locationId: LOCATION_ID,
                authorizedBy: MANAGER_ID,
                issuedAt: Date.now(),
                expiresAt: Date.now() + 60_000,
            },
        });
        mockValidateAttendanceKioskExitPinSecure.mockResolvedValue({ success: true });
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

    it('validateEmployeePinSecure exige kiosko pareado y valida solo contra el PIN real del empleado', async () => {
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: EMPLOYEE_ID, name: 'Empleado', assigned_location_id: LOCATION_ID }],
            rowCount: 1,
        });

        const result = await attendanceV2.validateEmployeePinSecure(EMPLOYEE_ID, '9999', 'attendance-token');

        expect(result.success).toBe(true);
        expect(result.valid).toBe(true);
        expect(result.employeeName).toBe('Empleado');
        expect(mockValidatePinForUser).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.any(Function) }),
            EMPLOYEE_ID,
            '9999',
            expect.objectContaining({
                allowLegacyPlaintext: true,
            })
        );
    });

    it('rechaza validateEmployeePinSecure si el empleado está fuera de la sucursal del kiosko', async () => {
        mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

        const result = await attendanceV2.validateEmployeePinSecure(EMPLOYEE_ID, '9999', 'attendance-token');

        expect(result.success).toBe(false);
        expect(result.error).toContain('sucursal del kiosko');
        expect(mockValidatePinForUser).not.toHaveBeenCalled();
    });

    it('rechaza registerAttendanceSecure sin sesión ni token de kiosko', async () => {
        mockGetActorOrFail.mockRejectedValue(
            new ImportedPinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await attendanceV2.registerAttendanceSecure({
            userId: EMPLOYEE_ID,
            type: 'CHECK_IN',
            locationId: LOCATION_ID,
            method: 'PIN',
            overtimeMinutes: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
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

    it('getTodayAttendanceSecure fuerza scope efectivo y enmascara datos sensibles para manager', async () => {
        setActor('MANAGER');
        mockClientQuery.mockResolvedValueOnce({
            rows: [{
                id: EMPLOYEE_ID,
                name: 'Empleado Uno',
                rut: '12345678-9',
                job_title: 'CAJERO',
                role: 'CASHIER',
                assigned_location_id: LOCATION_ID,
                current_status: 'CHECK_IN',
                last_log_time: new Date('2026-04-02T12:00:00.000Z'),
                last_location_id: LOCATION_ID,
                last_login_ip: '10.0.0.7',
            }],
            rowCount: 1,
        });

        const result = await attendanceV2.getTodayAttendanceSecure();

        expect(result.success).toBe(true);
        expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE u.is_active = true'), [LOCATION_ID]);
        expect(result.data?.[0]).toMatchObject({
            rut: '12*****-9',
            last_login_ip: null,
        });
    });

    it('validateKioskExitPin delega la validación al hardening server-side del kiosko', async () => {
        const result = await attendanceV2.validateKioskExitPin('9999', 'attendance-token');

        expect(result.valid).toBe(true);
        expect(mockValidateAttendanceKioskExitPinSecure).toHaveBeenCalledWith({
            pin: '9999',
            kioskToken: 'attendance-token',
        });
    });
});
