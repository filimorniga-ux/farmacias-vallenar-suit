import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
    mockRequireApiRoles,
    mockClient,
    mockPool,
    mockLogger,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
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
        mockRequireApiRoles.mockResolvedValue({
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
    });

    it('rechaza cuando auth ya deniega la operación', async () => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: false,
            response: NextResponse.json({ error: 'No autorizado', code: 'AUTH_UNAUTHORIZED' }, { status: 401 }),
        });

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR' }),
        }));

        expect(response.status).toBe(401);
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('vacía inventario con sesión válida y audita actor desde sesión', async () => {
        mockClient.query.mockResolvedValue(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
        expect(mockClient.query).toHaveBeenNthCalledWith(2, 'TRUNCATE TABLE products CASCADE');
        expect(mockClient.query).toHaveBeenNthCalledWith(3, 'COMMIT');
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'manager-1', actorRole: 'MANAGER' }),
            '[MaintenanceRoute] Inventory truncated'
        );
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('rechaza código de confirmación inválido', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'NOPE' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(payload.error).toBe('Invalid confirmation code');
        expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('redacta detalles internos cuando la mutación falla', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('permission denied for table products'))
            .mockResolvedValueOnce(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/maintenance', {
            method: 'POST',
            body: JSON.stringify({ action: 'TRUNCATE', confirmation: 'BORRAR' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload).toEqual({
            error: 'Maintenance action failed',
            code: 'MAINTENANCE_ACTION_FAILED',
        });
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
