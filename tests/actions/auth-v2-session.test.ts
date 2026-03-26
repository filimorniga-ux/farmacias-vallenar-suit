import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authV2 from '@/actions/auth-v2';
import * as dbModule from '@/lib/db';

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

function setCookieValues(values: Record<string, string | undefined>) {
    mockCookieStore.get.mockImplementation((name: string) => {
        const value = values[name];
        return value ? { value } : undefined;
    });
}

describe('Auth V2 - session issuance and logout', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('emite session_token y user_token_version en login exitoso', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
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
                fields: [],
            })
            .mockResolvedValueOnce({
                rows: [{ token_version: 7 }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: [],
            });

        const result = await authV2.authenticateUserSecure('user-1', '1234');

        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.user.token_version).toBe(7);
        expect(mockCookieStore.set).toHaveBeenCalledWith(
            'session_token',
            expect.any(String),
            expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
        );
        expect(mockCookieStore.set).toHaveBeenCalledWith(
            'user_token_version',
            '7',
            expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
        );
    });

    it('autocorrige el esquema de sesión en desarrollo si faltan columnas y reintenta el login', async () => {
        vi.mocked(dbModule.query)
            .mockResolvedValueOnce({
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
                fields: [],
            })
            .mockRejectedValueOnce({
                code: '42703',
                message: 'column "session_token" of relation "users" does not exist',
            })
            .mockResolvedValueOnce({
                rows: [],
                rowCount: 0,
                command: '',
                oid: 0,
                fields: [],
            })
            .mockResolvedValueOnce({
                rows: [{ token_version: 9 }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: [],
            });

        const result = await authV2.authenticateUserSecure('user-1', '1234');

        expect(result.success).toBe(true);
        expect(dbModule.query).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('ADD COLUMN IF NOT EXISTS session_token TEXT')
        );
        expect(mockCookieStore.set).toHaveBeenCalledWith(
            'user_token_version',
            '9',
            expect.objectContaining({ httpOnly: true, sameSite: 'lax' })
        );
    });

    it('logout invalida sesión real y limpia cookies sensibles', async () => {
        setCookieValues({
            user_id: 'user-1',
            session_token: 'token-actual',
        });

        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [],
            rowCount: 1,
            command: '',
            oid: 0,
            fields: [],
        });

        await authV2.logoutCurrentSessionSecure();

        expect(dbModule.query).toHaveBeenCalledWith(
            expect.stringContaining('SET session_token = NULL'),
            ['user-1', 'token-actual']
        );

        const clearedCookies = mockCookieStore.set.mock.calls.map(([name]) => name);
        expect(clearedCookies).toEqual(expect.arrayContaining([
            'user_id',
            'user_role',
            'user_name',
            'user_location',
            'session_token',
            'user_token_version',
        ]));
    });
});
