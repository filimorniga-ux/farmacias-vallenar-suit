import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockGetValidatedSession,
    mockCheckRateLimit,
    mockRecordFailedAttempt,
    mockResetAttempts,
    mockBcryptCompare,
} = vi.hoisted(() => ({
    mockGetValidatedSession: vi.fn(),
    mockCheckRateLimit: vi.fn(),
    mockRecordFailedAttempt: vi.fn(),
    mockResetAttempts: vi.fn(),
    mockBcryptCompare: vi.fn(),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: (...args: unknown[]) => mockGetValidatedSession(...args),
}));

vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
    recordFailedAttempt: (...args: unknown[]) => mockRecordFailedAttempt(...args),
    resetAttempts: (...args: unknown[]) => mockResetAttempts(...args),
}));

vi.mock('bcryptjs', () => ({
    default: {
        compare: (...args: unknown[]) => mockBcryptCompare(...args),
    },
}));

import {
    PinRbacError,
    ROLE_GROUPS,
    getActorOrFail,
    requireRole,
    validatePinForRoles,
    validatePinForUser,
} from '@/lib/pin-rbac';

describe('pin-rbac', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckRateLimit.mockReturnValue({
            allowed: true,
            remainingAttempts: 5,
            blockedUntil: null,
        });
        mockBcryptCompare.mockResolvedValue(false);
    });

    it('getActorOrFail retorna actor canónico cuando la sesión es válida', async () => {
        mockGetValidatedSession.mockResolvedValueOnce({
            userId: 'user-1',
            role: 'manager',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const actor = await getActorOrFail();

        expect(actor.userId).toBe('user-1');
        expect(actor.role).toBe('MANAGER');
    });

    it('getActorOrFail falla cerrado sin sesión', async () => {
        mockGetValidatedSession.mockResolvedValueOnce(null);

        await expect(getActorOrFail()).rejects.toMatchObject({
            code: 'AUTH_UNAUTHORIZED',
            message: 'Sesión no válida. Vuelve a iniciar sesión.',
        });
    });

    it('requireRole acepta rol permitido', () => {
        const actor = requireRole({
            userId: 'user-1',
            role: 'manager',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 1,
            sessionToken: 'token',
        }, ROLE_GROUPS.MANAGER);

        expect(actor.role).toBe('MANAGER');
    });

    it('requireRole rechaza rol no autorizado', () => {
        expect(() => requireRole({
            userId: 'user-2',
            role: 'cashier',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        }, ROLE_GROUPS.ADMIN)).toThrowError(PinRbacError);
    });

    it('validatePinForRoles autoriza PIN hasheado', async () => {
        mockBcryptCompare.mockResolvedValueOnce(true);
        const client = {
            query: vi.fn().mockResolvedValueOnce({
                rows: [{
                    id: 'manager-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_1234',
                    access_pin: null,
                }],
            }),
        };

        const result = await validatePinForRoles(client, '1234', ROLE_GROUPS.MANAGER);

        expect(result).toEqual({
            valid: true,
            authorizedBy: { id: 'manager-1', name: 'Gerente', role: 'MANAGER' },
            matchedBy: 'hash',
        });
    });

    it('validatePinForRoles rechaza PIN inválido', async () => {
        const client = {
            query: vi.fn().mockResolvedValueOnce({
                rows: [{
                    id: 'manager-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_1234',
                    access_pin: null,
                }],
            }),
        };

        const result = await validatePinForRoles(client, '9999', ROLE_GROUPS.MANAGER);

        expect(result).toEqual({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });
    });

    it('validatePinForRoles respeta allowLegacyPlaintext', async () => {
        const client = {
            query: vi.fn().mockResolvedValueOnce({
                rows: [{
                    id: 'admin-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: null,
                    access_pin: '1234',
                }],
            }),
        };

        const result = await validatePinForRoles(client, '1234', ROLE_GROUPS.ADMIN, {
            allowLegacyPlaintext: true,
        });

        expect(result).toEqual({
            valid: true,
            authorizedBy: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
            matchedBy: 'legacy_plaintext',
        });
    });

    it('validatePinForRoles aplica rate limiting cuando corresponde', async () => {
        mockCheckRateLimit.mockReturnValueOnce({
            allowed: false,
            remainingAttempts: 0,
            blockedUntil: new Date('2026-03-27T10:00:00.000Z'),
            reason: 'Bloqueado temporalmente',
        });
        const client = {
            query: vi.fn().mockResolvedValueOnce({
                rows: [{
                    id: 'admin-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed_1234',
                    access_pin: null,
                }],
            }),
        };

        const result = await validatePinForRoles(client, '1234', ROLE_GROUPS.ADMIN, {
            useRateLimiter: true,
        });

        expect(result).toEqual({
            valid: false,
            code: 'PIN_RATE_LIMITED',
            error: 'Bloqueado temporalmente',
        });
        expect(mockRecordFailedAttempt).not.toHaveBeenCalled();
    });

    it('validatePinForRoles registra intentos fallidos con rate limiter', async () => {
        const client = {
            query: vi.fn().mockResolvedValueOnce({
                rows: [{
                    id: 'admin-1',
                    name: 'Admin',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed_1234',
                    access_pin: null,
                }],
            }),
        };

        await validatePinForRoles(client, '4321', ROLE_GROUPS.ADMIN, {
            useRateLimiter: true,
        });

        expect(mockRecordFailedAttempt).toHaveBeenCalledWith('admin-1');
        expect(mockResetAttempts).not.toHaveBeenCalled();
    });

    it('validatePinForUser respeta requiredMatchUserId', async () => {
        mockBcryptCompare.mockResolvedValueOnce(true);
        const client = {
            query: vi.fn().mockResolvedValueOnce({
                rows: [{
                    id: 'user-1',
                    name: 'Usuario',
                    role: 'CASHIER',
                    access_pin_hash: 'hashed_1234',
                    access_pin: null,
                }],
            }),
        };

        const result = await validatePinForUser(client, 'user-1', '1234', {
            requiredMatchUserId: 'user-2',
        });

        expect(result).toEqual({
            valid: false,
            code: 'PIN_USER_MISMATCH',
            error: 'El PIN no corresponde al usuario requerido',
        });
    });

    it('1213 ya no tiene tratamiento especial y falla si no es el PIN real del usuario', async () => {
        mockBcryptCompare.mockReset();
        mockBcryptCompare.mockResolvedValue(false);
        const client = {
            query: vi.fn().mockResolvedValue({
                rows: [{
                    id: 'manager-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_9999',
                    access_pin: null,
                }],
            }),
        };

        const result = await validatePinForRoles(client, '1213', ROLE_GROUPS.MANAGER, {
            allowLegacyPlaintext: true,
        });

        expect(result).toEqual({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });
    });
});
