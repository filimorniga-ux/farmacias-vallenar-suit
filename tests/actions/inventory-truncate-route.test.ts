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

import { POST } from '@/app/api/inventory/truncate/route';

describe('POST /api/inventory/truncate', () => {
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

    it('rechaza cuando auth falla sin tocar DB', async () => {
        mockRequireApiRoles.mockResolvedValueOnce({
            ok: false,
            response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
        });

        const response = await POST(new Request('http://localhost/api/inventory/truncate', {
            method: 'POST',
            body: JSON.stringify({ confirmation: 'BORRAR' }),
        }));

        expect(response.status).toBe(401);
    });

    it('retorna 410 después de RBAC sin parsear payload legacy', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/truncate', {
            method: 'POST',
            body: '{payload-invalido',
        }));
        const payload = await response.json();

        expect(response.status).toBe(410);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            error: 'Endpoint legacy deshabilitado. Use /api/inventory/maintenance con action TRUNCATE.',
            code: 'INVENTORY_TRUNCATE_LEGACY_DISABLED',
        });
    });

    it('mantiene la respuesta 410 aunque llegue confirmación antigua válida', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/truncate', {
            method: 'POST',
            body: JSON.stringify({ confirmation: 'BORRAR' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(410);
        expect(payload.code).toBe('INVENTORY_TRUNCATE_LEGACY_DISABLED');
    });
});
