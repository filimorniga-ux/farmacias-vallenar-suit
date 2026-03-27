import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockPoolQuery,
    mockDirectQuery,
    mockRelease,
    mockGetActorOrFail,
    mockValidatePinForUser,
    mockValidatePinForRoles,
    mockCanAuthorizeShiftClosure,
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
        mockPoolQuery: vi.fn(),
        mockDirectQuery: vi.fn(),
        mockRelease: vi.fn(),
        mockGetActorOrFail: vi.fn(),
        mockValidatePinForUser: vi.fn(),
        mockValidatePinForRoles: vi.fn(),
        mockCanAuthorizeShiftClosure: vi.fn(),
        PinRbacError: MockPinRbacError,
    };
});

vi.mock('@/lib/db', () => ({
    pool: {
        connect: vi.fn(() => Promise.resolve({
            query: mockPoolQuery,
            release: mockRelease,
        })),
    },
    query: (...args: unknown[]) => mockDirectQuery(...args),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('uuid', () => ({
    v4: () => '550e8400-e29b-41d4-a716-446655440099',
}));

vi.mock('./shift-handover-policy', () => ({
    canAuthorizeShiftClosure: (...args: unknown[]) => mockCanAuthorizeShiftClosure(...args),
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
    validatePinForRoles: (...args: unknown[]) => mockValidatePinForRoles(...args),
    validatePinForUser: (...args: unknown[]) => mockValidatePinForUser(...args),
}));

import {
    calculateHandoverSecure,
    executeHandoverSecure,
    quickHandoverSecure,
} from '@/actions/shift-handover-v2';
import { PinRbacError as ImportedPinRbacError } from '@/lib/pin-rbac';

const ACTOR_ID = '550e8400-e29b-41d4-a716-446655440010';
const PAYLOAD_USER_ID = '550e8400-e29b-41d4-a716-446655440011';
const SUPERVISOR_ID = '550e8400-e29b-41d4-a716-446655440012';
const TERMINAL_ID = '550e8400-e29b-41d4-a716-446655440013';
const LOCATION_ID = '550e8400-e29b-41d4-a716-446655440014';
const SESSION_ID = '550e8400-e29b-41d4-a716-446655440015';
const INCOMING_USER_ID = '550e8400-e29b-41d4-a716-446655440016';

function setActor(role: string = 'CASHIER') {
    mockGetActorOrFail.mockResolvedValue({
        userId: ACTOR_ID,
        role,
        locationId: LOCATION_ID,
        userName: 'Cajero sesión',
        tokenVersion: 1,
        sessionToken: 'session-token',
    });
}

describe('shift-handover-v2 shared PIN/RBAC contracts', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setActor();
        mockDirectQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockPoolQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockValidatePinForUser.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: ACTOR_ID,
                name: 'Cajero sesión',
                role: 'CASHIER',
            },
            matchedBy: 'hash',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: SUPERVISOR_ID,
                name: 'Supervisor',
                role: 'MANAGER',
            },
            matchedBy: 'hash',
        });
        mockCanAuthorizeShiftClosure.mockReturnValue(true);
    });

    it('calculateHandoverSecure rechaza terminal inválido', async () => {
        const result = await calculateHandoverSecure('invalid', 1000);

        expect(result.success).toBe(false);
        expect(result.error).toContain('ID inválido');
    });

    it('executeHandoverSecure rechaza sin sesión válida', async () => {
        mockGetActorOrFail.mockRejectedValue(
            new ImportedPinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await executeHandoverSecure({
            terminalId: TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 150000,
            amountToWithdraw: 0,
            amountToKeep: 150000,
            userId: PAYLOAD_USER_ID,
            userPin: '1234',
            supervisorPin: '9999',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('executeHandoverSecure valida el PIN del actor de sesión y no el userId del payload', async () => {
        mockPoolQuery.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 };
            }

            return { rows: [], rowCount: 0 };
        });

        mockValidatePinForUser.mockResolvedValueOnce({
            valid: false,
            error: 'PIN incorrecto',
        });

        const result = await executeHandoverSecure({
            terminalId: TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 150000,
            amountToWithdraw: 0,
            amountToKeep: 150000,
            userId: PAYLOAD_USER_ID,
            userPin: '1234',
            supervisorPin: '9999',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN de cajero incorrecto');
        expect(mockValidatePinForUser).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.any(Function) }),
            ACTOR_ID,
            '1234',
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
    });

    it('executeHandoverSecure audita con el actor de sesión y mantiene al supervisor como metadato', async () => {
        mockPoolQuery.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 };
            }

            if (sql.includes('FROM terminals')) {
                return {
                    rows: [{
                        id: TERMINAL_ID,
                        location_id: LOCATION_ID,
                        current_cashier_id: ACTOR_ID,
                        status: 'OPEN',
                    }],
                    rowCount: 1,
                };
            }

            if (sql.includes('FROM cash_register_sessions')) {
                return {
                    rows: [{
                        id: SESSION_ID,
                        user_id: PAYLOAD_USER_ID,
                        opening_amount: 50000,
                        opened_at: new Date('2026-03-27T10:00:00.000Z'),
                    }],
                    rowCount: 1,
                };
            }

            if (sql.includes('SELECT name FROM users WHERE id = $1 LIMIT 1')) {
                return {
                    rows: [{ name: 'Dueño de turno' }],
                    rowCount: 1,
                };
            }

            if (sql.includes('UPDATE cash_register_sessions')) {
                return {
                    rows: [{ id: SESSION_ID }],
                    rowCount: 1,
                };
            }

            if (sql.includes('UPDATE terminals')) {
                return { rows: [], rowCount: 1 };
            }

            if (sql.includes('INSERT INTO audit_log')) {
                return { rows: [], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
        });

        const result = await executeHandoverSecure({
            terminalId: TERMINAL_ID,
            declaredCash: 150000,
            expectedCash: 140000,
            amountToWithdraw: 100000,
            amountToKeep: 50000,
            userId: PAYLOAD_USER_ID,
            userPin: '1234',
            supervisorPin: '9999',
        });

        expect(result.success).toBe(true);

        const auditCall = mockPoolQuery.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1][0]).toBe(ACTOR_ID);

        const newValues = JSON.parse(String(auditCall?.[1][5]));
        expect(newValues).toMatchObject({
            shift_owner_name: 'Dueño de turno',
            closed_by_actor: 'Cajero sesión',
            authorized_by_supervisor: 'Supervisor',
        });
        expect(mockValidatePinForRoles).toHaveBeenCalledWith(
            expect.objectContaining({ query: expect.any(Function) }),
            '9999',
            ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
    });

    it('quickHandoverSecure audita con el actor de sesión y no con outgoingUserId', async () => {
        mockValidatePinForUser
            .mockResolvedValueOnce({
                valid: true,
                authorizedBy: { id: PAYLOAD_USER_ID, name: 'Cajero saliente', role: 'CASHIER' },
                matchedBy: 'hash',
            })
            .mockResolvedValueOnce({
                valid: true,
                authorizedBy: { id: INCOMING_USER_ID, name: 'Cajero entrante', role: 'CASHIER' },
                matchedBy: 'hash',
            });

        mockPoolQuery.mockImplementation(async (sql: string) => {
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return { rows: [], rowCount: 0 };
            }

            if (sql.includes('FROM terminals')) {
                return {
                    rows: [{
                        id: TERMINAL_ID,
                        location_id: LOCATION_ID,
                        current_cashier_id: PAYLOAD_USER_ID,
                    }],
                    rowCount: 1,
                };
            }

            if (sql.includes('FROM cash_register_sessions')) {
                return {
                    rows: [{
                        id: SESSION_ID,
                        opening_amount: 50000,
                        opened_at: new Date('2026-03-27T10:00:00.000Z'),
                    }],
                    rowCount: 1,
                };
            }

            if (sql.includes('UPDATE cash_register_sessions')) {
                return { rows: [], rowCount: 1 };
            }

            if (sql.includes('INSERT INTO cash_register_sessions')) {
                return { rows: [], rowCount: 1 };
            }

            if (sql.includes('UPDATE terminals')) {
                return { rows: [], rowCount: 1 };
            }

            if (sql.includes('INSERT INTO audit_log')) {
                return { rows: [], rowCount: 1 };
            }

            return { rows: [], rowCount: 0 };
        });

        const result = await quickHandoverSecure({
            terminalId: TERMINAL_ID,
            outgoingUserId: PAYLOAD_USER_ID,
            outgoingUserPin: '1234',
            incomingUserId: INCOMING_USER_ID,
            incomingUserPin: '4321',
            declaredCash: 150000,
        });

        expect(result.success).toBe(true);
        expect(result.newSessionId).toBe('550e8400-e29b-41d4-a716-446655440099');

        const auditCall = mockPoolQuery.mock.calls.find(([sql]) =>
            String(sql).includes('INSERT INTO audit_log')
        );
        expect(auditCall?.[1][0]).toBe(ACTOR_ID);
        expect(mockValidatePinForUser).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ query: expect.any(Function) }),
            PAYLOAD_USER_ID,
            '1234',
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
        expect(mockValidatePinForUser).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ query: expect.any(Function) }),
            INCOMING_USER_ID,
            '4321',
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
    });
});
