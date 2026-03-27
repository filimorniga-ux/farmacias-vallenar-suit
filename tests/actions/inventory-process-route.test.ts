import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
    mockRequireApiRoles,
    mockProcessImportBatch,
    mockLogger,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
    mockProcessImportBatch: vi.fn(),
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

vi.mock('@/services/inventory-matcher', () => ({
    processImportBatch: mockProcessImportBatch,
}));

vi.mock('@/lib/logger', () => ({
    logger: mockLogger,
}));

import { POST } from '@/app/api/inventory/process/route';

describe('POST /api/inventory/process', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

    it('rechaza auth inválida', async () => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: false,
            response: NextResponse.json({ error: 'No autorizado', code: 'AUTH_UNAUTHORIZED' }, { status: 401 }),
        });

        const response = await POST(new Request('http://localhost/api/inventory/process', {
            method: 'POST',
            body: JSON.stringify({ batchSize: 10 }),
        }));

        expect(response.status).toBe(401);
        expect(mockProcessImportBatch).not.toHaveBeenCalled();
    });

    it('rechaza batchSize inválido', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/process', {
            method: 'POST',
            body: JSON.stringify({ batchSize: 0 }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            success: false,
            error: 'Invalid batchSize',
            code: 'INVALID_BATCH_SIZE',
        });
        expect(mockProcessImportBatch).not.toHaveBeenCalled();
    });

    it('procesa lote con sesión válida y registra actor real', async () => {
        mockProcessImportBatch.mockResolvedValueOnce({
            processed: 7,
            message: 'ok',
        });

        const response = await POST(new Request('http://localhost/api/inventory/process', {
            method: 'POST',
            body: JSON.stringify({ batchSize: 25 }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({
            success: true,
            processed: 7,
            message: 'ok',
        });
        expect(mockProcessImportBatch).toHaveBeenCalledWith(25);
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'manager-1', batchSize: 25, processed: 7 }),
            '[InventoryProcessRoute] Batch processed'
        );
    });

    it('redacta errores internos del procesador', async () => {
        mockProcessImportBatch.mockRejectedValueOnce(new Error('timeout talking to matcher backend'));

        const response = await POST(new Request('http://localhost/api/inventory/process', {
            method: 'POST',
            body: JSON.stringify({ batchSize: 20 }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload).toEqual({
            success: false,
            error: 'No fue posible procesar el lote de inventario',
            code: 'INVENTORY_PROCESS_FAILED',
        });
    });
});
