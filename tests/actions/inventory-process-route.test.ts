import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
    mockRequireApiRoles,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
    OPERATIONS_API_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    requireApiRoles: mockRequireApiRoles,
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
    });

    it('retorna 410 después de RBAC sin parsear payload legacy', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/process', {
            method: 'POST',
            body: '{payload-invalido',
        }));
        const payload = await response.json();

        expect(response.status).toBe(410);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Procesamiento legacy de inventario deshabilitado. Use flujos canónicos de importación y diagnóstico.',
            code: 'INVENTORY_PROCESS_LEGACY_DISABLED',
        });
    });

    it('mantiene 410 aunque llegue batchSize antiguo válido', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/process', {
            method: 'POST',
            body: JSON.stringify({ batchSize: 25 }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(410);
        expect(payload.code).toBe('INVENTORY_PROCESS_LEGACY_DISABLED');
    });
});
