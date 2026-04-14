import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const {
    mockRequireApiRoles,
    mockGetClient,
    mockClient,
} = vi.hoisted(() => ({
    mockRequireApiRoles: vi.fn(),
    mockGetClient: vi.fn(),
    mockClient: {
        query: vi.fn(),
        release: vi.fn(),
    },
}));

vi.mock('@/lib/api-auth', () => ({
    OPERATIONS_API_ROLES: ['MANAGER', 'ADMIN', 'GERENTE_GENERAL'],
    requireApiRoles: mockRequireApiRoles,
}));

vi.mock('@/lib/db', () => ({
    getClient: mockGetClient,
}));

import { POST } from '@/app/api/inventory/truncate/route';

describe('POST /api/inventory/truncate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetClient.mockResolvedValue(mockClient);
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
        expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('rechaza confirmación inválida sin pedir cliente', async () => {
        const response = await POST(new Request('http://localhost/api/inventory/truncate', {
            method: 'POST',
            body: JSON.stringify({ confirmation: 'NOPE' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toContain('Confirmación inválida');
        expect(mockGetClient).not.toHaveBeenCalled();
    });

    it('usa getClient compartido para truncar inventario', async () => {
        mockClient.query.mockResolvedValue(undefined);

        const response = await POST(new Request('http://localhost/api/inventory/truncate', {
            method: 'POST',
            body: JSON.stringify({ confirmation: 'BORRAR' }),
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(mockGetClient).toHaveBeenCalledTimes(1);
        expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
        expect(mockClient.query).toHaveBeenCalledWith('DELETE FROM inventory_batches');
        expect(mockClient.query).toHaveBeenCalledWith(
            expect.stringContaining('UPDATE products'),
        );
        expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
        expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
});
