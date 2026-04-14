import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/terminals/validate-session/route';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
}));

vi.mock('@/lib/server-session', () => ({
    getValidatedSession: vi.fn(),
}));

import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

function buildRequest(body: unknown) {
    return new Request('http://localhost/api/terminals/validate-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

describe('POST /api/terminals/validate-session', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza sin sesión válida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('AUTH_UNAUTHORIZED');
        expect(query).not.toHaveBeenCalled();
    });

    it('colapsa sesión inexistente a respuesta no enumerable', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(query).mockResolvedValueOnce({
            rows: [],
            rowCount: 0,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.valid).toBe(false);
        expect(payload.error).toBe('Sesión inválida');
    });

    it('permite flujo autorizado con sesión activa', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(query).mockResolvedValueOnce({
            rows: [{
                id: 'sess-1',
                status: 'OPEN',
                opened_at: new Date().toISOString(),
                user_id: 'user-1',
                terminal_status: 'OPEN',
            }],
            rowCount: 1,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.valid).toBe(true);
    });
});
