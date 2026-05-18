import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
    mockRequireApiRoles,
    mockValidatePinForRoles,
    mockClient,
    mockPool,
    mockLogger,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
    mockValidatePinForRoles: vi.fn(),
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
    mockPool: {
        connect: vi.fn(),
    },
    mockLogger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('@/lib/api-auth', () => ({
    OPERATIONS_API_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    requireApiRoles: mockRequireApiRoles,
}));

vi.mock('@/lib/pin-rbac', () => ({
    ROLE_GROUPS: {
        ADMIN: ['ADMIN', 'GERENTE_GENERAL'],
    },
    validatePinForRoles: mockValidatePinForRoles,
}));

vi.mock('@/lib/db', () => ({
    pool: mockPool,
}));

vi.mock('@/lib/logger', () => ({
    logger: mockLogger,
}));

import { POST } from '@/app/api/inventory/maintenance/route';

describe('POST /api/inventory/maintenance', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPool.connect.mockResolvedValue(mockClient);
        mockValidatePinForRoles.mockResolvedValue({
            valid: true,
            authorizedBy: { id: 'admin-1', name: 'Admin', role: 'ADMIN' },
            matchedBy: 'hash',
        });
        mockRequireApiRoles.mockResolvedValue({
            ok: true,
            session: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
    });

    it('rechaza cuando auth ya deniega la operación', async () => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: false,
            response: NextResponse.json({ error: 'No autorizado', code: 'AUTH_UNAUTHORIZED' }, { status: 401 }),
        });

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR', adminPin: '1234' }),
        }));

        expect(response.status).toBe(401);
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rechaza body declarado demasiado grande antes de parsear o abrir DB', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            headers: {
                'content-length': String((16 * 1024) + 1),
                'content-type': 'application/json',
            },
            body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(413);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Payload de mantenimiento demasiado grande',
            code: 'MAINTENANCE_BODY_TOO_LARGE',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('vacía inventario con sesión admin válida y audita actor desde sesión', async () => {
        mockClient.query.mockResolvedValue(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR', adminPin: '1234' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(mockValidatePinForRoles).toHaveBeenCalledWith(
            mockClient,
            '1234',
            ['ADMIN', 'GERENTE_GENERAL'],
            expect.objectContaining({ allowLegacyPlaintext: true, useRateLimiter: true }),
        );
        expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM inventory_batches');
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE products p'),
        );
        expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'admin-1', actorRole: 'ADMIN' }),
            '[MaintenanceRoute] Canonical inventory truncate completed'
        );
        expect(mockClient.release).toHaveBeenCalled();
    });

    it.each([
        ['TRUNCATE', { confirmation: 'BORRAR' }],
        ['UNDO_IMPORT', {}],
    ])('rechaza %s para MANAGER antes de abrir conexión DB', async (action, extraPayload) => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
                userName: 'Gerente',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action, ...extraPayload }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Acción destructiva restringida a administradores',
            code: 'MAINTENANCE_DESTRUCTIVE_FORBIDDEN',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ action, actorUserId: 'manager-1', actorRole: 'MANAGER' }),
            '[MaintenanceRoute] Destructive maintenance action denied'
        );
    });

    it('rechaza código de confirmación inválido', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'NOPE' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Código de confirmación inválido',
            code: 'MAINTENANCE_CONFIRMATION_REQUIRED',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('rechaza reversa de importación sin confirmación textual antes de abrir DB', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'UNDO_IMPORT', adminPin: '1234' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Código de confirmación inválido',
            code: 'MAINTENANCE_CONFIRMATION_REQUIRED',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockValidatePinForRoles).not.toHaveBeenCalled();
    });

    it('rechaza acción destructiva sin PIN antes de abrir conexión DB', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'PIN administrador requerido',
            code: 'MAINTENANCE_ADMIN_PIN_REQUIRED',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockValidatePinForRoles).not.toHaveBeenCalled();
    });

    it('rechaza PIN admin inválido antes de ejecutar mutaciones destructivas', async () => {
        mockValidatePinForRoles.mockResolvedValueOnce({
            valid: false,
            code: 'PIN_INVALID',
            error: 'PIN inválido',
        });

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'UNDO_IMPORT', confirmation: 'DESHACER', adminPin: '9999' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'PIN inválido',
            code: 'PIN_INVALID',
        });
        expect(mockValidatePinForRoles).toHaveBeenCalled();
        expect(mockClient.query).not.toHaveBeenCalledWith('BEGIN');
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('permite análisis de duplicados para MANAGER porque es read-only', async () => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'manager-1',
                role: 'MANAGER',
                locationId: 'loc-1',
                userName: 'Gerente',
                tokenVersion: 1,
                sessionToken: 'token',
            },
        });
        mockClient.query.mockResolvedValueOnce({
            rows: [{ sku: 'SKU-1', count: '2', ids: ['prod-1', 'prod-2'] }],
        });

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.duplicates).toEqual([{ sku: 'SKU-1', count: '2', ids: ['prod-1', 'prod-2'] }]);
        expect(mockPool.connect).toHaveBeenCalledTimes(1);
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('redacta detalles internos cuando la mutación falla', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('permission denied for table products'))
            .mockResolvedValueOnce(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR', adminPin: '1234' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Maintenance action failed',
            code: 'MAINTENANCE_ACTION_FAILED',
        });
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
