import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
    mockRequireApiRoles,
    mockReceiveProduct,
    mockLogger,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
    mockReceiveProduct: vi.fn(),
    mockLogger: {
        error: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    },
}));

vi.mock('@/lib/api-auth', () => ({
    INVENTORY_API_ROLES: ['WAREHOUSE', 'QF', 'MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    requireApiRoles: mockRequireApiRoles,
}));

vi.mock('@/lib/data/supply', () => ({
    receiveProduct: mockReceiveProduct,
}));

vi.mock('@/lib/logger', () => ({
    logger: mockLogger,
}));

import { POST } from '@/app/api/supply/receive/route';

describe('POST /api/supply/receive', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequireApiRoles.mockResolvedValue({
            ok: true,
            session: {
                userId: 'warehouse-1',
                role: 'WAREHOUSE',
                locationId: 'loc-1',
                userName: 'Bodega',
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

        const response = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({}),
        }));

        expect(response.status).toBe(401);
        expect(mockReceiveProduct).not.toHaveBeenCalled();
    });

    it('rechaza payload incompleto o cantidad inválida', async () => {
        const missingFields = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({ producto_id: 'prod-1' }),
        }));
        const invalidCantidad = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({
                producto_id: 'prod-1',
                numero_lote: 'LOT-1',
                fecha_vencimiento: '2026-12-31',
                cantidad: 0,
            }),
        }));

        expect(missingFields.status).toBe(400);
        expect((await missingFields.json()).error).toBe('Missing fields');
        expect(invalidCantidad.status).toBe(400);
        expect(await invalidCantidad.json()).toEqual({
            error: 'Invalid cantidad',
            code: 'INVALID_CANTIDAD',
        });
    });

    it('recibe producto con actor real de sesión y sin confiar en payload para identidad', async () => {
        mockReceiveProduct.mockResolvedValueOnce(undefined);

        const response = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({
                producto_id: 'prod-1',
                numero_lote: 'LOT-1',
                fecha_vencimiento: '2026-12-31',
                cantidad: '12',
                proveedor_id: 'prov-1',
                userId: 'spoofed-user',
            }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload).toEqual({ success: true });
        expect(mockReceiveProduct).toHaveBeenCalledWith({
            producto_id: 'prod-1',
            numero_lote: 'LOT-1',
            fecha_vencimiento: '2026-12-31',
            cantidad: 12,
            ubicacion_fisica: 'Bodega Central',
        });
        expect(mockLogger.info).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'warehouse-1', actorRole: 'WAREHOUSE', productoId: 'prod-1' }),
            '[SupplyReceiveRoute] Product received'
        );
    });

    it('redacta errores internos de recepción', async () => {
        mockReceiveProduct.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'));

        const response = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({
                producto_id: 'prod-1',
                numero_lote: 'LOT-1',
                fecha_vencimiento: '2026-12-31',
                cantidad: 3,
            }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload).toEqual({
            error: 'No fue posible registrar la recepción del producto',
            code: 'SUPPLY_RECEIVE_FAILED',
        });
    });
});
