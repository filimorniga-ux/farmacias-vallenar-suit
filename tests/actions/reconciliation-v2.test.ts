import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockClient,
    PinRbacError,
    headersMock,
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
        mockClient: {
            query: vi.fn(),
            release: vi.fn(),
        },
        PinRbacError: MockPinRbacError,
        headersMock: vi.fn(async () => new Map([['x-forwarded-for', '127.0.0.1']])),
    };
});

vi.mock('@/lib/db', () => ({
    pool: {
        connect: vi.fn(async () => mockClient),
    },
}));

vi.mock('@/lib/pin-rbac', () => ({
    getActorOrFail: vi.fn(),
    requireRole: vi.fn((actor, allowedRoles: readonly string[]) => {
        if (!allowedRoles.includes(actor.role)) {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        }

        return actor;
    }),
    validatePinForRoles: vi.fn(),
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    },
    PinRbacError,
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
    headers: headersMock,
}));

import { getActorOrFail, validatePinForRoles } from '@/lib/pin-rbac';
import {
    approveReconciliationSecure,
    calculateDiscrepancySecure,
    performReconciliationSecure,
} from '@/actions/reconciliation-v2';

const VALID_SESSION_ID = '550e8400-e29b-41d4-a716-446655440081';

describe('Reconciliation V2 - shared pin/rbac migration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getActorOrFail).mockResolvedValue({
            userId: 'session-manager',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Manager Real',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(validatePinForRoles).mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: 'pin-manager',
                name: 'Manager PIN',
                role: 'MANAGER',
            },
            matchedBy: 'hash',
        });
    });

    it('rechaza calcular discrepancia sin sesión válida', async () => {
        vi.mocked(getActorOrFail).mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.')
        );

        const result = await calculateDiscrepancySecure(VALID_SESSION_ID);

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('rechaza conciliación con rol insuficiente', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await performReconciliationSecure({
            sessionId: VALID_SESSION_ID,
            realClosingAmount: 100000,
            managerNotes: 'Cierre revisado por caja',
            managerPin: '1234',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Solo managers');
    });

    it('rechaza PIN inválido al conciliar', async () => {
        vi.mocked(validatePinForRoles).mockResolvedValueOnce({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce(undefined); // ROLLBACK

        const result = await performReconciliationSecure({
            sessionId: VALID_SESSION_ID,
            realClosingAmount: 100000,
            managerNotes: 'Cierre revisado por manager',
            managerPin: '1234',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN inválido');
        expect(validatePinForRoles).toHaveBeenCalledWith(
            mockClient,
            '1234',
            ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            })
        );
    });

    it('usa el actor de sesión para reconciliar y auditar, no el usuario del PIN', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_SESSION_ID,
                    opening_amount: 100000,
                    closing_amount: 95000,
                    difference: -5000,
                    status: 'OPEN',
                    terminal_id: 'terminal-1',
                }],
                rowCount: 1,
            })
            .mockResolvedValueOnce({
                rows: [{
                    cash_sales: 40000,
                    expenses: 5000,
                    withdrawals: 0,
                    deposits: 10000,
                }],
                rowCount: 1,
            })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE session
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // AUDIT
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await performReconciliationSecure({
            sessionId: VALID_SESSION_ID,
            realClosingAmount: 145000,
            managerNotes: 'Conciliación revisada por gerente de turno',
            managerPin: '1234',
        });

        expect(result.success).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE cash_register_sessions'),
            expect.arrayContaining(['session-manager', VALID_SESSION_ID])
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_log'),
            expect.arrayContaining(['session-manager', VALID_SESSION_ID])
        );
        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining('UPDATE cash_register_sessions'),
            expect.arrayContaining(['pin-manager'])
        );
    });

    it('usa el actor admin de sesión al aprobar, no el usuario del PIN', async () => {
        vi.mocked(getActorOrFail).mockResolvedValueOnce({
            userId: 'admin-session',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin Real',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(validatePinForRoles).mockResolvedValueOnce({
            valid: true,
            authorizedBy: {
                id: 'pin-admin',
                name: 'Admin PIN',
                role: 'ADMIN',
            },
            matchedBy: 'hash',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({
                rows: [{
                    id: VALID_SESSION_ID,
                    difference: 60000,
                    status: 'RECONCILED',
                    reconciled_by: 'session-manager',
                }],
                rowCount: 1,
            })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE approval
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // AUDIT
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await approveReconciliationSecure({
            sessionId: VALID_SESSION_ID,
            adminPin: '9999',
            approvalNotes: 'Diferencia aprobada por revisión administrativa',
        });

        expect(result.success).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE cash_register_sessions'),
            expect.arrayContaining(['admin-session', VALID_SESSION_ID])
        );
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO audit_log'),
            expect.arrayContaining(['admin-session', VALID_SESSION_ID])
        );
        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining('UPDATE cash_register_sessions'),
            expect.arrayContaining(['pin-admin'])
        );
    });
});
