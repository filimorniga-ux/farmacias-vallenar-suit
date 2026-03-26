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
        expect(payload).toEqual({
            error: 'Failed to import batch',
            code: 'BATCH_IMPORT_FAILED',
        });
        expect(payload.details).toBeUndefined();
        expect(payload.debug).toBeUndefined();
        expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
        expect(mockClient.release).toHaveBeenCalled();
    });
});
