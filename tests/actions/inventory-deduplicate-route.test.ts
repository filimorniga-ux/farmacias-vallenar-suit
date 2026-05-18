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

    it('rechaza body declarado demasiado grande antes de parsear o abrir DB', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            headers: {
                'content-length': String((8 * 1024) + 1),
                'content-type': 'application/json',
            },
            body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(413);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Payload de análisis demasiado grande',
            code: 'DEDUPLICATE_BODY_TOO_LARGE',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
        expect(mockClient.query).not.toHaveBeenCalled();
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
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.duplicates).toEqual([{ sku: 'SKU-1', count: '2', name: 'Producto Duplicado' }]);
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('rechaza merge destructivo legacy antes de consultar DB', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            body: JSON.stringify({ action: 'MERGE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(410);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Fusión automática de duplicados deshabilitada. Revise los duplicados en modo solo lectura.',
            code: 'DEDUPLICATE_MERGE_LEGACY_DISABLED',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('redacta detalles internos si el análisis falla', async () => {
        mockClient.query.mockRejectedValueOnce(new Error('permission denied for table products'));

        const response = await POST(new Request('http://localhost/api/inventory/deduplicate', {
            method: 'POST',
            body: JSON.stringify({ action: 'ANALYZE_DUPLICATES' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Error al procesar duplicados',
            code: 'DEDUPLICATE_FAILED',
        });
        expect(mockLogger.error).toHaveBeenCalled();
    });
});
