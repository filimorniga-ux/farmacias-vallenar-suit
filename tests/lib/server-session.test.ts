import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockCookieStore } = vi.hoisted(() => ({
    mockCookieStore: {
        get: vi.fn(),
        set: vi.fn(),
    },
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => mockCookieStore),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

function setCookieValues(values: Record<string, string | undefined>) {
    mockCookieStore.get.mockImplementation((name: string) => {
        const value = values[name];
        return value ? { value } : undefined;
    });
}

describe('server-session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('falla cerrado si solo existen cookies crudas sin session_token ni token_version', async () => {
        setCookieValues({
            user_id: 'user-1',
            user_role: 'ADMIN',
        });

        const result = await getValidatedSession();

        expect(result).toBeNull();
        expect(query).not.toHaveBeenCalled();
    });

    it('ignora user_role cookie y devuelve el rol validado desde DB', async () => {
        setCookieValues({
            user_id: 'user-1',
            user_role: 'ADMIN',
            user_name: 'Nombre Cookie',
            user_location: 'loc-cookie',
            session_token: 'token-valido',
            user_token_version: '3',
        });

        vi.mocked(query).mockResolvedValueOnce({
            rows: [{
                id: 'user-1',
                name: 'Usuario DB',
                role: 'CASHIER',
                assigned_location_id: 'loc-db',
                token_version: 3,
                session_token: 'token-valido',
                is_active: true,
            }],
            rowCount: 1,
            command: '',
            oid: 0,
            fields: [],
        });

        const result = await getValidatedSession();

        expect(result).toEqual({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-cookie',
            userName: 'Usuario DB',
            tokenVersion: 3,
            sessionToken: 'token-valido',
        });
    });

    it('rechaza la sesión si user_token_version no coincide con DB', async () => {
        setCookieValues({
            user_id: 'user-1',
            session_token: 'token-valido',
            user_token_version: '2',
        });

        vi.mocked(query).mockResolvedValueOnce({
            rows: [{
                id: 'user-1',
                name: 'Usuario DB',
                role: 'MANAGER',
                assigned_location_id: 'loc-db',
                token_version: 3,
                session_token: 'token-valido',
                is_active: true,
            }],
            rowCount: 1,
            command: '',
            oid: 0,
            fields: [],
        });

        const result = await getValidatedSession();

        expect(result).toBeNull();
    });

    it('autocorrige el esquema en desarrollo si falta session_token y reintenta la validación', async () => {
        setCookieValues({
            user_id: 'user-1',
            user_name: 'Nombre Cookie',
            user_location: 'loc-cookie',
            session_token: 'token-valido',
            user_token_version: '4',
        });

        vi.mocked(query)
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
                rows: [{
                    id: 'user-1',
                    name: 'Usuario DB',
                    role: 'MANAGER',
                    assigned_location_id: 'loc-db',
                    token_version: 4,
                    session_token: 'token-valido',
                    is_active: true,
                }],
                rowCount: 1,
                command: '',
                oid: 0,
                fields: [],
            });

        const result = await getValidatedSession();

        expect(query).toHaveBeenNthCalledWith(
            2,
            expect.stringContaining('ADD COLUMN IF NOT EXISTS session_token TEXT')
        );
        expect(result).toEqual({
            userId: 'user-1',
            role: 'MANAGER',
            locationId: 'loc-cookie',
            userName: 'Usuario DB',
            tokenVersion: 4,
            sessionToken: 'token-valido',
        });
    });
});
