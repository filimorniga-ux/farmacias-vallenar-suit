import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockConnect = vi.fn();
const mockRelease = vi.fn();
const mockGetActorOrFail = vi.fn();
const mockRequireRole = vi.fn((actor, _allowedRoles) => actor);
const mockValidatePinForRoles = vi.fn();

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
        },
        getActorOrFail: () => mockGetActorOrFail(),
        requireRole: (actor: unknown, allowedRoles: unknown) => mockRequireRole(actor, allowedRoles),
        validatePinForRoles: (
            client: unknown,
            pin: unknown,
            allowedRoles: unknown,
            options?: unknown,
        ) => mockValidatePinForRoles(client, pin, allowedRoles, options),
    };
});

import * as financialAccountsV2 from '@/actions/financial-accounts-v2';

describe('Financial Accounts V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
        mockGetActorOrFail.mockResolvedValue({
            userId: 'session-admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin Sesion',
            tokenVersion: 1,
            sessionToken: 'session-token',
        });
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: {
                id: 'pin-admin-1',
                name: 'Admin PIN',
                role: 'ADMIN',
            },
            matchedBy: 'hash',
        });
    });

    it('should require authentication for getFinancialAccountsSecure', async () => {
        const { PinRbacError } = await import('@/lib/pin-rbac');
        mockGetActorOrFail.mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.'),
        );

        const result = await financialAccountsV2.getFinancialAccountsSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('should reject createFinancialAccountSecure for insufficient actor role', async () => {
        const { PinRbacError } = await import('@/lib/pin-rbac');
        mockRequireRole.mockImplementationOnce(() => {
            throw new PinRbacError('AUTH_FORBIDDEN', 'Acceso denegado');
        });

        const result = await financialAccountsV2.createFinancialAccountSecure(
            { name: 'Cuenta Restringida', type: 'BANK', initialBalance: 0 },
            '1234',
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('ADMIN');
        expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should audit createFinancialAccountSecure with session actor and PIN authorizer metadata', async () => {
        const result = await financialAccountsV2.createFinancialAccountSecure(
            { name: 'Cuenta Banco', type: 'BANK', initialBalance: 15000 },
            '1234',
        );

        expect(result.success).toBe(true);

        const auditCall = mockQuery.mock.calls.find(
            ([sql]) => typeof sql === 'string' && sql.includes('FINANCIAL_ACCOUNT_CREATED'),
        ) as unknown[] | undefined;

        expect(auditCall).toBeDefined();
        const auditParams = (auditCall?.[1] as unknown[]) || [];
        expect(auditParams[0]).toBe('session-admin-1');
        expect(JSON.parse(String(auditParams[2]))).toMatchObject({
            created_by: 'Admin Sesion',
            authorized_by: 'pin-admin-1',
            authorized_by_name: 'Admin PIN',
        });
    });

    it('should require authentication for getAccountBalance', async () => {
        const { PinRbacError } = await import('@/lib/pin-rbac');
        mockGetActorOrFail.mockRejectedValueOnce(
            new PinRbacError('AUTH_UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.'),
        );

        const result = await financialAccountsV2.getAccountBalance('123e4567-e89b-12d3-a456-426614174000');

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});
