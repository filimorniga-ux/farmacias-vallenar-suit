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

import { POST } from '@/app/api/inventory/deduplicate/route';

describe('POST /api/inventory/deduplicate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPool.connect.mockResolvedValue(mockClient);
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

    it('rechaza auth inválida', async () => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: false,
            response: NextResponse.json({ error: 'Acceso denegado', code: 'AUTH_FORBIDDEN' }, { status: 403 }),
        });

        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
        }));

        expect(response.status).toBe(403);
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('analiza duplicados sin mutar estado', async () => {
        mockClient.query.mockResolvedValueOnce({
            rows: [{ sku: 'SKU-1', count: '2', ids: ['a', 'b'] }],
        });

        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.duplicates).toEqual([{ sku: 'SKU-1', count: '2', name: 'Producto Duplicado' }]);
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('fusiona duplicados con actor auditado desde sesión', async () => {
        mockClient.query
            .mockResolvedValueOnce({ rows: [{ sku: 'SKU-1', count: '2', ids: ['a', 'b'] }] })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce({
                rows: [
                    { id: 'master', stock_actual: 10, created_at: '2026-03-27T10:00:00Z' },
                    { id: 'dup-1', stock_actual: 4, created_at: '2026-03-26T10:00:00Z' },
                ],
            })
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined)
            .mockResolvedValueOnce(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            body: JSON.stringify({ action: 'MERGE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            mergedCount: 1,
            message: 'Se fusionaron 1 productos correctamente.',
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'admin-1', actorRole: 'ADMIN', mergedCount: 1 }),
            '[InventoryDeduplicateRoute] Duplicates merged'
        );
    });

    it('redacta detalles internos si el merge falla', async () => {
        mockClient.query
            .mockResolvedValueOnce({ rows: [{ sku: 'SKU-1', count: '2', ids: ['a', 'b'] }] })
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error('deadlock detected while deleting duplicates'))
            .mockResolvedValueOnce(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            body: JSON.stringify({ action: 'MERGE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload).toEqual({
            error: 'Error al procesar duplicados',
            code: 'DEDUPLICATE_FAILED',
        });
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
