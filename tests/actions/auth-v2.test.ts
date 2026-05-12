import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authV2 from '@/actions/auth-v2';
import * as dbModule from '@/lib/db';
import * as bcrypt from 'bcryptjs';

const { mockCookieStore } = vi.hoisted(() => ({
    mockCookieStore: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => mockCookieStore),
}));
vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));
vi.mock('bcryptjs', () => ({
    default: {
        compare: vi.fn(async (plainText: string, hash: string) => hash === `hashed_${plainText}`),
    },
    compare: vi.fn(async (plainText: string, hash: string) => hash === `hashed_${plainText}`),
}));

function getDefaultBcryptCompareMock() {
    const bcryptModule = bcrypt as typeof bcrypt & {
        default: {
            compare: (plainText: string, hash: string) => Promise<boolean>;
        };
    };

    return vi.mocked(bcryptModule.default.compare);
}

function mockValidatedSessionCookies() {
    const values: Record<string, string> = {
        user_id: 'actor-1',
        user_name: 'Caja',
        user_location: 'loc-1',
        session_token: 'session-token',
        user_token_version: '1',
    };

    mockCookieStore.get.mockImplementation((name: string) => {
        const value = values[name];
        return value ? { value } : undefined;
    });
}

function validatedSessionDbRow() {
    return {
        rows: [{
            id: 'actor-1',
            name: 'Caja',
            role: 'CASHIER',
            assigned_location_id: 'loc-1',
            token_version: 1,
            session_token: 'session-token',
            is_active: true,
        }],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: []
    };
}

describe('Auth V2 - Typed error mapping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockCookieStore.get.mockReset();
        mockCookieStore.set.mockReset();
    });

    it('returns DB_TIMEOUT metadata when database times out', async () => {
        vi.mocked(dbModule.query).mockRejectedValueOnce(new Error('Connection terminated due to connection timeout'));

        const result = await authV2.authenticateUserSecure('user-1', '1234');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('DB_TIMEOUT');
        expect(result.retryable).toBe(true);
        expect(result.correlationId).toBeTruthy();
        expect(result.userMessage).toContain('Servicio temporalmente no disponible');
    });

    it('returns AUTH_INVALID_PIN for invalid pin without retry', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin: '9999',
                    access_pin_hash: null,
                    assigned_location_id: 'loc-1',
                    is_active: true,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin: '9999',
                    access_pin_hash: null,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.authenticateUserSecure('user-1', '1234');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('AUTH_INVALID_PIN');
        expect(result.retryable).toBe(false);
    });

    it('returns success and writes session cookies when credentials are valid', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin: '1234',
                    access_pin_hash: null,
                    assigned_location_id: 'loc-1',
                    is_active: true,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-1',
                    name: 'Gerente',
                    role: 'MANAGER',
                    access_pin: '1234',
                    access_pin_hash: null,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{ token_version: 1 }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.authenticateUserSecure('user-1', '1234');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.user.id).toBe('user-1');
        expect(mockCookieStore.set).toHaveBeenCalled();
    });

    it('returns success when user only has access_pin_hash', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-hash',
                    name: 'Gerente Hash',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_4321',
                    access_pin: null,
                    assigned_location_id: 'loc-2',
                    is_active: true,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-hash',
                    name: 'Gerente Hash',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_4321',
                    access_pin: null,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{ token_version: 2 }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.authenticateUserSecure('user-hash', '4321');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.user.id).toBe('user-hash');
        expect(getDefaultBcryptCompareMock()).toHaveBeenCalledWith('4321', 'hashed_4321');
    });

    it('rechaza 1213 cuando no es el PIN real del usuario', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-dev',
                    name: 'Usuario Dev',
                    role: 'CASHIER',
                    access_pin_hash: 'hashed_9999',
                    access_pin: '9999',
                    assigned_location_id: 'loc-dev',
                    is_active: true,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'user-dev',
                    name: 'Usuario Dev',
                    role: 'CASHIER',
                    access_pin_hash: 'hashed_9999',
                    access_pin: '9999',
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.authenticateUserSecure('user-dev', '1213');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.code).toBe('AUTH_INVALID_PIN');
        expect(mockCookieStore.set).not.toHaveBeenCalled();
    });

    it('validateSupervisorPin acepta PIN hash', async () => {
        mockValidatedSessionCookies();
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce(validatedSessionDbRow())
            .mockResolvedValueOnce({
                rows: [{
                    id: 'sup-1',
                    name: 'Supervisor',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_1234',
                    access_pin: null,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.validateSupervisorPin('1234');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.authorizedBy?.id).toBe('sup-1');
        expect(getDefaultBcryptCompareMock()).toHaveBeenCalledWith('1234', 'hashed_1234');
    });

    it('validateSupervisorPin acepta fallback legacy plaintext', async () => {
        mockValidatedSessionCookies();
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce(validatedSessionDbRow())
            .mockResolvedValueOnce({
                rows: [{
                    id: 'sup-legacy',
                    name: 'Supervisor Legacy',
                    role: 'ADMIN',
                    access_pin_hash: null,
                    access_pin: '1213',
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.validateSupervisorPin('1213');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.authorizedBy?.id).toBe('sup-legacy');
    });

    it('validateSupervisorPin rechaza PIN inválido', async () => {
        mockValidatedSessionCookies();
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce(validatedSessionDbRow())
            .mockResolvedValueOnce({
                rows: [{
                    id: 'sup-1',
                    name: 'Supervisor',
                    role: 'MANAGER',
                    access_pin_hash: 'hashed_9999',
                    access_pin: null,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.validateSupervisorPin('1234');

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(result.error).toContain('PIN inválido');
    });

    it('verifyUserPin acepta hash para roles autorizados', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
                rows: [{
                    role: 'ADMIN',
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            })
            .mockResolvedValueOnce({
                rows: [{
                    id: 'admin-1',
                    name: 'Admin Uno',
                    role: 'ADMIN',
                    access_pin_hash: 'hashed_4321',
                    access_pin: null,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: []
            });

        const result = await authV2.verifyUserPin('admin-1', '4321');

        expect(result.success).toBe(true);
        expect(getDefaultBcryptCompareMock()).toHaveBeenCalledWith('4321', 'hashed_4321');
    });
});
