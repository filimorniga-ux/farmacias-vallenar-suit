import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const {
    mockRequireApiRoles,
    mockLogger,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
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
    });

    it('bloquea el endpoint legacy despues de RBAC sin procesar recepciones', async () => {
        const response = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({
                producto_id: 1,
                numero_lote: 'LOT-1',
                fecha_vencimiento: '2026-12-31',
                cantidad: 12,
                proveedor_id: 'prov-1',
                userId: 'spoofed-user',
            }),
        }));

        expect(response.status).toBe(410);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(await response.json()).toEqual({
            error: 'Recepción legacy deshabilitada. Use el flujo WMS/abastecimiento vigente.',
            code: 'SUPPLY_RECEIVE_LEGACY_DISABLED',
        });
        expect(mockLogger.warn).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'warehouse-1', actorRole: 'WAREHOUSE' }),
            '[SupplyReceiveRoute] Legacy endpoint disabled',
        );
    });

    it('no parsea payloads legacy cuando el endpoint esta deshabilitado', async () => {
        const response = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: '{',
        }));

        expect(response.status).toBe(410);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(await response.json()).toEqual({
            error: 'Recepción legacy deshabilitada. Use el flujo WMS/abastecimiento vigente.',
            code: 'SUPPLY_RECEIVE_LEGACY_DISABLED',
        });
    });

    it('no importa el writer legacy de productos/lotes desde el endpoint App Router', () => {
        const source = readFileSync(
            join(process.cwd(), 'src/app/api/supply/receive/route.ts'),
            'utf8',
        );

        expect(source).not.toContain("@/lib/data/supply");
        expect(source).not.toContain('receiveProduct');
    });

    it('redacta errores internos de auth/bootstrap', async () => {
        mockRequireApiRoles.mockRejectedValueOnce(new Error('db unavailable'));

        const response = await POST(new Request('http://localhost/api/supply/receive', {
            method: 'POST',
            body: JSON.stringify({
                producto_id: 1,
                numero_lote: 'LOT-1',
                fecha_vencimiento: '2026-12-31',
                cantidad: 3,
            }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'No fue posible registrar la recepción del producto',
            code: 'SUPPLY_RECEIVE_FAILED',
        });
    });
});
