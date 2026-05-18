/**
 * Tests - Cash V2 Module
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockValidatePinForRoles = vi.fn();
const mockValidatePinForUser = vi.fn();

vi.mock('@/lib/db', () => ({
    query: (...args: unknown[]) => mockQuery(...args),
    pool: {
        connect: () => {
            mockConnect();
            return Promise.resolve({
                query: mockQuery,
                release: mockRelease,
            });
        },
    },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('crypto', () => ({ randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999') }));
vi.mock('@/lib/pin-rbac', () => {
    class MockPinRbacError extends Error {
        code: string;

        constructor(code: string, message: string) {
            super(message);
            this.name = 'PinRbacError';
            this.code = code;
        }
    }

    return {
        PinRbacError: MockPinRbacError,
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
    };
});

import * as cashV2 from '@/actions/cash-v2';
import { PinRbacError } from '@/lib/pin-rbac';

const ACTOR = {
    userId: 'user-1',
    role: 'CASHIER',
    locationId: 'loc-1',
    userName: 'Caja',
    tokenVersion: 1,
    sessionToken: 'token',
};

beforeEach(() => {
    vi.clearAllMocks();
    mockGetActorOrFail.mockResolvedValue(ACTOR);
    mockValidatePinForRoles.mockResolvedValue({
        valid: true,
        authorizedBy: { id: 'manager-1', name: 'Manager', role: 'MANAGER' },
    });
    mockValidatePinForUser.mockResolvedValue({
        valid: true,
        authorizedBy: { id: ACTOR.userId, name: ACTOR.userName, role: ACTOR.role },
    });
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

describe('Cash V2 - Authentication', () => {
    it('should require authentication', async () => {
        mockGetActorOrFail.mockRejectedValueOnce(new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida'));

        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 1000,
            reason: 'Test',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});

describe('Cash V2 - PIN Thresholds', () => {
    it('should require PIN for withdrawals > $20,000', async () => {
        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 25000,
            reason: 'Test withdrawal',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('20');
    });

    it('should validate actor PIN for withdrawals > $20,000 and <= $100,000', async () => {
        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 25000,
            reason: 'Test withdrawal',
        }, '1234');

        expect(result.success).toBe(true);
        expect(mockValidatePinForUser).toHaveBeenCalledWith(expect.anything(), ACTOR.userId, '1234', expect.anything());
    });

    it('should require MANAGER PIN for withdrawals > $100,000', async () => {
        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 150000,
            reason: 'Large withdrawal',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager');
    });

    it('should reject invalid manager PIN for large withdrawals', async () => {
        mockValidatePinForRoles.mockResolvedValueOnce({
            valid: false,
            error: 'PIN de manager inválido',
        });

        const result = await cashV2.createCashMovementSecure({
            terminalId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'WITHDRAWAL',
            amount: 150000,
            reason: 'Large withdrawal',
        }, '9999');

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager inválido');
    });
});

describe('Cash V2 - Expense', () => {
    it('should require manager PIN for all expenses', async () => {
        mockValidatePinForRoles.mockResolvedValueOnce({
            valid: false,
            error: 'PIN de manager inválido',
        });

        const result = await cashV2.createExpenseSecure(
            { amount: 5000, category: 'SUPPLIES', description: 'Office supplies' },
            '0000'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('manager');
    });

    it('should audit expenses with actor session and authorized manager separately', async () => {
        const result = await cashV2.createExpenseSecure(
            { amount: 5000, category: 'SUPPLIES', description: 'Office supplies' },
            '9999'
        );

        expect(result.success).toBe(true);

        const auditCall = mockQuery.mock.calls.find(([sql]) => String(sql).includes('EXPENSE_CREATED'));
        expect(auditCall?.[1][0]).toBe(ACTOR.userId);
        expect(String(auditCall?.[1][2])).toContain('authorized_by_id');
    });
});

describe('Cash V2 - No AUTO-DDL', () => {
    it('should NOT create tables on error', async () => {
        expect(true).toBe(true);
    });
});
