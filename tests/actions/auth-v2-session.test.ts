import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    mockQuery: vi.fn(),
    mockCreateServerSession: vi.fn(),
    mockGetValidatedSession: vi.fn(),
    mockInvalidateCurrentSession: vi.fn(),
    mockValidatePinForRoles: vi.fn(),
    mockValidatePinForUser: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: mocks.mockQuery,
    pool: { connect: vi.fn() },
}));

vi.mock('@/lib/server-session', () => ({
    createServerSession: mocks.mockCreateServerSession,
    getValidatedSession: mocks.mockGetValidatedSession,
    invalidateCurrentSession: mocks.mockInvalidateCurrentSession,
}));

vi.mock('@/lib/pin-rbac', () => ({
    ROLE_GROUPS: {
        MANAGER: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
        OVERRIDE: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL', 'QF'],
    },
    normalizeRole: (role: string | null | undefined) => String(role || '').trim().toUpperCase(),
    validatePinForRoles: mocks.mockValidatePinForRoles,
    validatePinForUser: mocks.mockValidatePinForUser,
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

describe('Auth V2 - session issuance and logout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.mockValidatePinForUser.mockResolvedValue({ valid: true });
        mocks.mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: { id: 'manager-1', name: 'Gerente', role: 'MANAGER' },
            matchedBy: 'hash',
        });
        mocks.mockCreateServerSession.mockResolvedValue({
            sessionToken: 'session-token',
            tokenVersion: 7,
        });
    });

    it('emite tokenVersion delegando la sesión al helper server-side', async () => {
        const authV2 = await import('@/actions/auth-v2');

        mocks.mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'user-1',
                name: 'Gerente',
                role: 'MANAGER',
                access_pin_hash: 'hashed_1234',
                access_pin: null,
                assigned_location_id: 'loc-1',
                is_active: true,
            }],
            rowCount: 1,
        });

        const result = await authV2.authenticateUserSecure('user-1', '1234');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.user.token_version).toBe(7);
        expect(mocks.mockCreateServerSession).toHaveBeenCalledWith({
            userId: 'user-1',
            userName: 'Gerente',
            role: 'MANAGER',
            locationId: 'loc-1',
        });
    });

    it('usa la location explícita cuando el login la entrega al helper de sesión', async () => {
        const authV2 = await import('@/actions/auth-v2');

        mocks.mockQuery.mockResolvedValueOnce({
            rows: [{
                id: 'user-1',
                name: 'Gerente',
                role: 'MANAGER',
                access_pin_hash: 'hashed_1234',
                access_pin: null,
                assigned_location_id: 'loc-db',
                is_active: true,
            }],
            rowCount: 1,
        });

        const result = await authV2.authenticateUserSecure('user-1', '1234', 'loc-override');

        expect(result.success).toBe(true);
        expect(mocks.mockCreateServerSession).toHaveBeenCalledWith({
            userId: 'user-1',
            userName: 'Gerente',
            role: 'MANAGER',
            locationId: 'loc-override',
        });
    });

    it('logout invalida la sesión usando el helper server-side', async () => {
        const authV2 = await import('@/actions/auth-v2');

        await authV2.logoutCurrentSessionSecure();

        expect(mocks.mockInvalidateCurrentSession).toHaveBeenCalledTimes(1);
    });

    it('validateSupervisorPin falla cerrado sin sesión activa', async () => {
        const authV2 = await import('@/actions/auth-v2');
        mocks.mockGetValidatedSession.mockResolvedValueOnce(null);

        const result = await authV2.validateSupervisorPin('1234');

        expect(result).toEqual({
            success: false,
            error: 'Sesión no válida. Vuelve a iniciar sesión.',
        });
        expect(mocks.mockValidatePinForRoles).not.toHaveBeenCalled();
    });

    it('validateSupervisorPin usa rate limit y solo permite roles de override', async () => {
        const authV2 = await import('@/actions/auth-v2');
        mocks.mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'cashier-1',
            userName: 'Caja',
            role: 'CASHIER',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await authV2.validateSupervisorPin('1234', ['MANAGER', 'CASHIER', 'QF']);

        expect(result.success).toBe(true);
        expect(mocks.mockValidatePinForRoles).toHaveBeenCalledWith(
            expect.anything(),
            '1234',
            ['MANAGER', 'QF'],
            {
                allowLegacyPlaintext: true,
                useRateLimiter: true,
            }
        );
    });

    it('validateSupervisorPin rechaza roles no autorizables antes de consultar PIN', async () => {
        const authV2 = await import('@/actions/auth-v2');
        mocks.mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'cashier-1',
            userName: 'Caja',
            role: 'CASHIER',
            locationId: 'loc-1',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await authV2.validateSupervisorPin('1234', ['CASHIER']);

        expect(result).toEqual({
            success: false,
            error: 'Rol de autorización no permitido',
        });
        expect(mocks.mockValidatePinForRoles).not.toHaveBeenCalled();
    });
});
