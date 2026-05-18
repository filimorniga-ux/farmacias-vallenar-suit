import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
import { POST } from '@/app/api/terminals/validate-session/route';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
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

import { query } from '@/lib/db';
import { getValidatedSession } from '@/lib/server-session';

const LOCATION_ID = '550e8400-e29b-41d4-a716-446655440001';
const OTHER_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440002';

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
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('AUTH_UNAUTHORIZED');
        expect(query).not.toHaveBeenCalled();
    });

    it('colapsa sesión inexistente a respuesta no enumerable', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: LOCATION_ID,
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
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.valid).toBe(false);
        expect(payload.error).toBe('Sesión inválida');
    });

    it('rechaza JSON inválido sin consultar la base de datos', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await POST(new Request('http://localhost/api/terminals/validate-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: '{',
        }) as NextRequest);
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'sessionId y terminalId requeridos',
            code: 'INVALID_TERMINAL_SESSION_PAYLOAD',
        });
        expect(query).not.toHaveBeenCalled();
    });

    it('rechaza roles autenticados que no pertenecen a superficie POS antes de consultar DB', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'warehouse-1',
            role: 'WAREHOUSE',
            locationId: LOCATION_ID,
            userName: 'Bodega',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'Acceso denegado',
            code: 'AUTH_FORBIDDEN',
        });
        expect(query).not.toHaveBeenCalled();
    });

    it('permite flujo autorizado con sesión activa', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: LOCATION_ID,
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
                location_id: LOCATION_ID,
                terminal_status: 'OPEN',
            }],
            rowCount: 1,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.valid).toBe(true);
    });

    it('colapsa sesión fuera de la sucursal del cajero a respuesta inválida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: LOCATION_ID,
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
                location_id: OTHER_LOCATION_ID,
                terminal_status: 'OPEN',
            }],
            rowCount: 1,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: true,
            valid: false,
            error: 'Sesión inválida',
        });
    });

    it('colapsa sesión de otro usuario a respuesta inválida para roles no globales', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'QF',
            locationId: LOCATION_ID,
            userName: 'QF',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(query).mockResolvedValueOnce({
            rows: [{
                id: 'sess-1',
                status: 'OPEN',
                opened_at: new Date().toISOString(),
                user_id: 'user-2',
                location_id: LOCATION_ID,
                terminal_status: 'OPEN',
            }],
            rowCount: 1,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: true,
            valid: false,
            error: 'Sesión inválida',
        });
    });

    it('permite a rol global POS validar una sesión activa de otra ubicación', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: LOCATION_ID,
            userName: 'Gerente',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(query).mockResolvedValueOnce({
            rows: [{
                id: 'sess-1',
                status: 'OPEN',
                opened_at: new Date().toISOString(),
                user_id: 'user-2',
                location_id: OTHER_LOCATION_ID,
                terminal_status: 'OPEN',
            }],
            rowCount: 1,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.valid).toBe(true);
    });

    it('colapsa una sesión con fecha de apertura inválida a respuesta inválida', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(query).mockResolvedValueOnce({
            rows: [{
                id: 'sess-1',
                status: 'OPEN',
                opened_at: 'fecha-corrupta',
                user_id: 'user-1',
                location_id: LOCATION_ID,
                terminal_status: 'OPEN',
            }],
            rowCount: 1,
        } as never);

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: true,
            valid: false,
            error: 'Sesión inválida',
        });
    });

    it('redacta errores internos de base de datos', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'user-1',
            role: 'CASHIER',
            locationId: LOCATION_ID,
            userName: 'Caja',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        vi.mocked(query).mockRejectedValueOnce(new Error('permission denied for table cash_register_sessions'));

        const response = await POST(buildRequest({ sessionId: 'sess-1', terminalId: 'term-1' }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(payload).toEqual({
            success: false,
            error: 'No fue posible validar la sesión de terminal',
            code: 'TERMINAL_SESSION_VALIDATION_FAILED',
        });
    });
});
