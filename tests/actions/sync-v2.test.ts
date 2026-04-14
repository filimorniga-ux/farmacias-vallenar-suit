import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as syncV2 from '@/actions/sync-v2';
import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

vi.mock('@/lib/db', () => ({ query: vi.fn(), pool: { connect: vi.fn() } }));
vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Sync V2 - server-side session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('nunca retorna access_pin ni access_pin_hash en fetchEmployeesSecure', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(query)
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: '1',
                        rut: '12345678-9',
                        name: 'Test',
                        role: 'CASHIER',
                        access_pin: '1234',
                        access_pin_hash: 'hash',
                    },
                ],
                rowCount: 1,
            } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

        const result = await syncV2.fetchEmployeesSecure();

        expect(result.success).toBe(true);
        expect(result.data?.[0]).not.toHaveProperty('access_pin');
        expect(result.data?.[0]).not.toHaveProperty('access_pin_hash');
    });

    it('rechaza fetchEmployeesSecure sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const result = await syncV2.fetchEmployeesSecure();

        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });

    it('audita acceso a datos usando el userId de sesión validada', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

        await syncV2.fetchEmployeesSecure();

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('audit_log'),
            expect.arrayContaining(['user-1'])
        );
    });

    it('filtra ubicaciones para usuarios no admin con la locationId de sesión', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(query)
            .mockResolvedValueOnce({ rows: [{ id: 'loc-1', name: 'Store 1' }], rowCount: 1 } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

        await syncV2.fetchLocationsSecure();

        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('id = $1'),
            expect.arrayContaining(['loc-1'])
        );
    });

    it('mantiene getUsersForLoginSecure como flujo público', async () => {
        vi.mocked(query).mockResolvedValueOnce({
            rows: [{ id: '1', rut: '12345678-9', name: 'Usuario', role: 'CASHIER', is_active: true }],
            rowCount: 1,
        } as never);

        const result = await syncV2.getUsersForLoginSecure();

        expect(result.success).toBe(true);
        expect(getValidatedSession).not.toHaveBeenCalled();
    });

    it('restringe empleados al scope de la ubicación para actores no globales', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 2,
            sessionToken: 'token',
        });

        vi.mocked(query)
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: 'cashier-1',
                        rut: '12345678-9',
                        name: 'Caja',
                        role: 'CASHIER',
                        assigned_location_id: 'loc-1',
                        status: 'ACTIVE',
                        job_title: 'CAJERO',
                        is_active: true,
                        token_version: 2,
                    },
                ],
                rowCount: 1,
            } as never)
            .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);

        const result = await syncV2.fetchEmployeesSecure();

        expect(result.success).toBe(true);
        expect(query).toHaveBeenCalledWith(
            expect.stringContaining('assigned_location_id::text = $2::text'),
            [false, 'loc-1']
        );
        expect(result.data?.[0]?.token_version).toBe(2);
    });

    it('rechaza inventario de otra bodega para actores no globales', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'cashier-1',
            role: 'CASHIER',
            locationId: 'loc-1',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        vi.mocked(query).mockResolvedValueOnce({
            rows: [{ location_id: 'loc-2' }],
            rowCount: 1,
        } as never);

        const result = await syncV2.fetchInventorySecure('550e8400-e29b-41d4-a716-446655440010');

        expect(result.success).toBe(false);
        expect(result.error).toContain('otra bodega');
    });
});
