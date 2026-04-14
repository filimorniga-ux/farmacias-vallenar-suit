import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    requireApiRolesMock: vi.fn(),
    getSiiEmissionConfigMock: vi.fn(),
    buildDteXMLMock: vi.fn(),
    calculateIVAMock: vi.fn(),
    calculateNetoFromTotalMock: vi.fn(),
    signXMLMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
    requireApiRoles: mocks.requireApiRolesMock,
}));

vi.mock('@/lib/sii-config', () => ({
    getSiiEmissionConfig: mocks.getSiiEmissionConfigMock,
}));

vi.mock('@/domain/logic/sii/crypto', () => ({
    signXML: mocks.signXMLMock,
}));

vi.mock('@/domain/logic/sii/dteBuilder', () => ({
    buildDteXML: mocks.buildDteXMLMock,
    calculateIVA: mocks.calculateIVAMock,
    calculateNetoFromTotal: mocks.calculateNetoFromTotalMock,
}));

import { POST } from '@/app/api/sii/emitir/route';

function buildRequest(body: unknown) {
    return new Request('http://localhost/api/sii/emitir', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

const BASE_BODY = {
    tipo: 39 as const,
    items: [
        {
            sku: 'SKU-1',
            nombre: 'Paracetamol',
            cantidad: 1,
            precio: 1000,
        },
    ],
    metodoPago: 'CASH' as const,
};

describe('POST /api/sii/emitir', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireApiRolesMock.mockResolvedValue({
            ok: true,
            session: {
                userId: 'manager-1',
                role: 'MANAGER',
            },
        });
        mocks.buildDteXMLMock.mockReturnValue('<DTE />');
        mocks.calculateNetoFromTotalMock.mockReturnValue(840);
        mocks.calculateIVAMock.mockReturnValue(160);
    });

    it('rechaza sin sesión', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: false,
            response: new Response(JSON.stringify({ success: false, error: 'No autorizado' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            }),
        });

        const response = await POST(buildRequest(BASE_BODY));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.success).toBe(false);
        expect(mocks.getSiiEmissionConfigMock).not.toHaveBeenCalled();
        expect(mocks.signXMLMock).not.toHaveBeenCalled();
    });

    it('rechaza rol insuficiente', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: false,
            response: new Response(JSON.stringify({ success: false, error: 'Acceso denegado' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            }),
        });

        const response = await POST(buildRequest(BASE_BODY));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(payload.success).toBe(false);
        expect(mocks.getSiiEmissionConfigMock).not.toHaveBeenCalled();
        expect(mocks.signXMLMock).not.toHaveBeenCalled();
    });

    it('rechaza payload inválido antes de tocar config o firma', async () => {
        const response = await POST(buildRequest({
            ...BASE_BODY,
            items: [],
        }));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.success).toBe(false);
        expect(payload.error).toBe('INVALID_PAYLOAD');
        expect(mocks.getSiiEmissionConfigMock).not.toHaveBeenCalled();
        expect(mocks.signXMLMock).not.toHaveBeenCalled();
    });

    it('lee configuración sólo desde el helper server-side y funciona con fallback sin certificado persistido', async () => {
        mocks.getSiiEmissionConfigMock.mockResolvedValueOnce({
            rutEmisor: '76.123.456-7',
            razonSocial: 'Farmacias Vallenar',
            giro: 'Farmacia',
            acteco: 477310,
            ambiente: 'CERTIFICACION',
            certificatePfxBase64: 'MOCK_CERT',
            certificatePassword: 'MOCK_PASS',
        });
        mocks.signXMLMock.mockResolvedValueOnce({
            success: true,
            signedXml: '<SIGNED />',
        });

        const response = await POST(buildRequest(BASE_BODY));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(mocks.getSiiEmissionConfigMock).toHaveBeenCalledTimes(1);
        expect(mocks.buildDteXMLMock).toHaveBeenCalledTimes(1);
        expect(mocks.signXMLMock).toHaveBeenCalledWith('<DTE />', 'MOCK_CERT', 'MOCK_PASS');
    });

    it('retorna SIGNATURE_ERROR si la firma falla aun usando configuración server-side', async () => {
        mocks.getSiiEmissionConfigMock.mockResolvedValueOnce({
            rutEmisor: '76.123.456-7',
            razonSocial: 'Farmacias Vallenar',
            giro: 'Farmacia',
            acteco: 477310,
            ambiente: 'PRODUCCION',
            certificatePfxBase64: 'SERVER_CERT',
            certificatePassword: 'SERVER_PASS',
        });
        mocks.signXMLMock.mockResolvedValueOnce({
            success: false,
            error: 'firma inválida',
        });

        const response = await POST(buildRequest(BASE_BODY));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(payload.success).toBe(false);
        expect(payload.error).toBe('SIGNATURE_ERROR');
        expect(mocks.signXMLMock).toHaveBeenCalledWith('<DTE />', 'SERVER_CERT', 'SERVER_PASS');
    });
});
