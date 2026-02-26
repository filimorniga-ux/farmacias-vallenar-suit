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
    compare: vi.fn(async (plainText: string, hash: string) => hash === `hashed_${plainText}`),
}));

describe('Auth V2 - Typed error mapping', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{
                id: 'user-1',
                name: 'Gerente',
                role: 'MANAGER',
                access_pin: '9999',
                assigned_location_id: 'loc-1',
                is_active: true,
            }],
            rowCount: 1,
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
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{
                id: 'user-1',
                name: 'Gerente',
                role: 'MANAGER',
                access_pin: '1234',
                assigned_location_id: 'loc-1',
                is_active: true,
            }],
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

    it('validateSupervisorPin acepta PIN hash', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
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
        expect(vi.mocked(bcrypt.compare)).toHaveBeenCalledWith('1234', 'hashed_1234');
    });

    it('validateSupervisorPin acepta fallback legacy plaintext', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
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
        vi.mocked(dbModule.query).mockResolvedValueOnce({
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
});
