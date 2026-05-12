import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockClient, mockPool } = vi.hoisted(() => ({
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
    mockPool: {
        connect: vi.fn(),
    },
}));

vi.mock('@/lib/db', () => ({
    pool: mockPool,
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

import { POST } from '@/app/api/inventory/batch/route';
import { getValidatedSession } from '@/lib/server-session';

describe('POST /api/inventory/batch', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockPool.connect.mockResolvedValue(mockClient);
        vi.mocked(getValidatedSession).mockResolvedValue({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 1,
            sessionToken: 'token',
        });
    });

    it('no expone debug interno ni detalles SQL en errores', async () => {
        mockClient.query
            .mockResolvedValueOnce(undefined) // BEGIN
            .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint on products'));

        const request = new Request('http://localhost/api/inventory/batch', {
            method: 'POST',
            body: JSON.stringify({
                products: [{
                    id: 'prod-1',
                    sku: 'SKU-1',
                    name: 'Producto',
                }],
            }),
        });

        const response = await POST(request);
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Failed to import batch',
            code: 'BATCH_IMPORT_FAILED',
        });
        expect(payload.details).toBeUndefined();
        expect(payload.debug).toBeUndefined();
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
    });

    it('rechaza JSON inválido antes de abrir conexión de base de datos', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/batch', {
            method: 'POST',
            body: '{',
        }));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Payload inválido',
            code: 'BATCH_IMPORT_INVALID_PAYLOAD',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rechaza body declarado demasiado grande antes de parsear JSON', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/batch', {
            method: 'POST',
            body: '{"products":[]}',
            headers: {
                'content-length': String((4 * 1024 * 1024) + 1),
                'content-type': 'application/json',
            },
        }));
        const payload = await response.json();

        expect(response.status).toBe(413);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'El archivo de importación supera el tamaño permitido',
            code: 'BATCH_IMPORT_BODY_TOO_LARGE',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rechaza operadores de bodega antes de abrir conexión de base de datos', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'warehouse-1',
            role: 'WAREHOUSE',
            locationId: 'loc-1',
            userName: 'Bodega',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await POST(new Request('http://localhost/api/inventory/batch', {
            method: 'POST',
            body: JSON.stringify({
                products: [{
                    id: 'prod-1',
                    sku: 'SKU-1',
                    name: 'Producto',
                }],
            }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Acceso denegado',
            code: 'AUTH_FORBIDDEN',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rechaza lotes demasiado grandes antes de abrir transacción', async () => {
        const products = Array.from({ length: 501 }, (_, index) => ({
            id: `prod-${index}`,
            sku: `SKU-${index}`,
            name: `Producto ${index}`,
        }));

        const response = await POST(new Request('http://localhost/api/inventory/batch', {
            method: 'POST',
            body: JSON.stringify({ products }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(413);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Máximo 500 productos por lote',
            code: 'BATCH_IMPORT_TOO_LARGE',
        });
        expect(mockPool.connect).not.toHaveBeenCalled();
    });

    it('rechaza valores numéricos negativos antes de upsert', async () => {
        mockClient.query.mockResolvedValueOnce(undefined); // BEGIN

        const response = await POST(new Request('http://localhost/api/inventory/batch', {
            method: 'POST',
            body: JSON.stringify({
                products: [{
                    id: 'prod-1',
                    sku: 'SKU-NEG',
                    name: 'Producto con precio inválido',
                    stock_actual: 5,
                    price: -100,
                }],
            }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            error: 'Precio, costo, stock y unidades no pueden ser negativos',
            code: 'BATCH_IMPORT_VALIDATION',
        });
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.query).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO products'),
            expect.any(Array),
        );
        expect(mockClient.release).toHaveBeenCalled();
    });
});
