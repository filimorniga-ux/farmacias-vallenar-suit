import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient } = vi.hoisted(() => ({
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn(async () => mockClient),
    },
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

import { getValidatedSession } from '@/lib/server-session';
import { pool } from '@/lib/db';
import { getSystemConfigsSecure, saveSystemConfigSecure } from '@/actions/config-v2';

describe('Config V2 - server-side session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza guardar configuración sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await saveSystemConfigSecure({
            key: 'SYSTEM_NAME',
            value: 'Farmacias Vallenar',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });

    it('rechaza roles no autorizados al listar configuraciones', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await getSystemConfigsSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('Acceso denegado');
    });

    it('guarda usando el userId de sesión validada y no el cliente', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // previous value
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // upsert
            .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // audit
            .mockResolvedValueOnce(undefined); // COMMIT

        const result = await saveSystemConfigSecure({
            key: 'SYSTEM_NAME',
            value: 'Farmacias Vallenar',
        });

        expect(result.success).toBe(true);
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO system_configs'),
            expect.arrayContaining(['admin-1'])
        );
    });
});
