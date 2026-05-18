import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteTerminalSecure, updateTerminalSecure } from '@/actions/terminals-v2';
import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        connect: vi.fn(),
    },
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('Terminals V2 - session-backed mutations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza updateTerminalSecure sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await updateTerminalSecure(
            '550e8400-e29b-41d4-a716-446655440010',
            { name: 'Caja 1' }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('rechaza updateTerminalSecure para roles no admin', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await updateTerminalSecure(
            '550e8400-e29b-41d4-a716-446655440010',
            { name: 'Caja 1' }
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('administrador');
    });

    it('audita updateTerminalSecure con el userId de sesión validada', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(query)
            .mockResolvedValueOnce({
                rows: [{ name: 'Caja Vieja', type: 'POS', printer_config: {} }],
                rowCount: 1,
            } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

        const result = await updateTerminalSecure(
            '550e8400-e29b-41d4-a716-446655440010',
            { name: 'Caja Nueva' }
        );

        expect(result.success).toBe(true);
        expect(query).toHaveBeenLastCalledWith(
            expect.stringContaining('TERMINAL_UPDATE'),
            expect.arrayContaining(['admin-1'])
        );
    });

    it('rechaza deleteTerminalSecure sin sesión admin válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const result = await deleteTerminalSecure('550e8400-e29b-41d4-a716-446655440010');

        expect(result.success).toBe(false);
        expect(result.error).toContain('administrador');
    });

    it('audita deleteTerminalSecure con sesión validada', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(query)
            .mockResolvedValueOnce({
                rows: [{ id: '550e8400-e29b-41d4-a716-446655440010', name: 'Caja 1', status: 'CLOSED', location_id: 'loc-1' }],
                rowCount: 1,
            } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);

        const result = await deleteTerminalSecure('550e8400-e29b-41d4-a716-446655440010');

        expect(result.success).toBe(true);
        expect(query).toHaveBeenLastCalledWith(
            expect.stringContaining('TERMINAL_DELETE'),
            expect.arrayContaining(['admin-1'])
        );
    });
});
