import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
    requireApiRolesMock: vi.fn(),
    getSiiConfigurationSummaryMock: vi.fn(),
    saveSiiConfigurationMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
    requireApiRoles: mocks.requireApiRolesMock,
}));

vi.mock('@/lib/sii-config', () => ({
    getSiiConfigurationSummary: mocks.getSiiConfigurationSummaryMock,
    saveSiiConfiguration: mocks.saveSiiConfigurationMock,
}));

import { GET, POST } from '@/app/api/sii/certificate/route';

const SAFE_SUMMARY = {
    id: 'SII-SERVER-CONFIG',
    rut_emisor: '76.123.456-7',
    razon_social: 'Farmacias Vallenar',
    giro: 'Farmacia',
    acteco: 477310,
    ambiente: 'CERTIFICACION' as const,
    hasCertificate: true,
    certificateCommonName: 'DEMO CERTIFICATE',
    certificateExpiresAt: 1893456000000,
    lastUploadedAt: 1769472000000,
};

function buildAuthFailureResponse(status: number, code: string) {
    return new Response(JSON.stringify({ success: false, code }), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function buildPostRequest(formData: FormData) {
    return new Request('http://localhost/api/sii/certificate', {
        method: 'POST',
        body: formData,
    }) as unknown as NextRequest;
}

function buildPostRequestWithHeaders(body: BodyInit, headers: Record<string, string>) {
    return new Request('http://localhost/api/sii/certificate', {
        method: 'POST',
        body,
        headers,
    }) as unknown as NextRequest;
}

describe('SII certificate route', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rechaza GET sin sesión o rol permitido', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: false,
            response: buildAuthFailureResponse(401, 'AUTH_UNAUTHORIZED'),
        });

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.code).toBe('AUTH_UNAUTHORIZED');
        expect(mocks.requireApiRolesMock).toHaveBeenCalledWith(['ADMIN', 'GERENTE_GENERAL']);
        expect(mocks.getSiiConfigurationSummaryMock).not.toHaveBeenCalled();
    });

    it('rechaza POST cuando el rol no está permitido', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: false,
            response: buildAuthFailureResponse(403, 'AUTH_FORBIDDEN'),
        });

        const formData = new FormData();
        formData.set('rut_emisor', '76.123.456-7');

        const response = await POST(buildPostRequest(formData));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(payload.code).toBe('AUTH_FORBIDDEN');
        expect(mocks.requireApiRolesMock).toHaveBeenCalledWith(['ADMIN', 'GERENTE_GENERAL']);
        expect(mocks.saveSiiConfigurationMock).not.toHaveBeenCalled();
    });

    it('propaga error controlado cuando el certificado no cumple validación', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
            },
        });
        mocks.saveSiiConfigurationMock.mockRejectedValueOnce(new Error('El certificado debe ser .pfx o .p12'));

        const formData = new FormData();
        formData.set('certificate', new File(['bad'], 'malware.pdf', { type: 'application/pdf' }));
        formData.set('certificatePassword', 'secreta');
        formData.set('rut_emisor', '76.123.456-7');
        formData.set('razon_social', 'Farmacias Vallenar');
        formData.set('giro', 'Farmacia');
        formData.set('acteco', '477310');
        formData.set('ambiente', 'CERTIFICACION');

        const response = await POST(buildPostRequest(formData));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.error).toBe('El certificado debe ser .pfx o .p12');
    });

    it('rechaza multipart declarado demasiado grande antes de parsear formData', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
            },
        });

        const response = await POST(buildPostRequestWithHeaders('too-large', {
            'content-length': String((6 * 1024 * 1024) + 1),
            'content-type': 'multipart/form-data; boundary=test',
        }));
        const payload = await response.json();

        expect(response.status).toBe(413);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload).toMatchObject({
            success: false,
            code: 'SII_CERTIFICATE_UPLOAD_TOO_LARGE',
        });
        expect(mocks.saveSiiConfigurationMock).not.toHaveBeenCalled();
    });

    it('permite continuar al validador de certificado cuando el upload declarado cabe en el límite', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
            },
        });
        mocks.saveSiiConfigurationMock.mockResolvedValueOnce(SAFE_SUMMARY);

        const certificateFile = new File([Uint8Array.from([1, 2, 3])], 'certificado.pfx', {
            type: 'application/x-pkcs12',
        });

        const formData = new FormData();
        formData.set('certificate', certificateFile);
        formData.set('certificatePassword', 'clave-secreta');
        formData.set('rut_emisor', SAFE_SUMMARY.rut_emisor);
        formData.set('razon_social', SAFE_SUMMARY.razon_social);
        formData.set('giro', SAFE_SUMMARY.giro);
        formData.set('acteco', String(SAFE_SUMMARY.acteco));
        formData.set('ambiente', SAFE_SUMMARY.ambiente);

        const response = await POST(buildPostRequestWithHeaders(formData, {
            'content-length': String(1024),
        }));

        expect(response.status).toBe(200);
        expect(mocks.saveSiiConfigurationMock).toHaveBeenCalledTimes(1);
    });

    it('acepta upload válido y devuelve sólo metadatos seguros', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'admin-1',
                role: 'ADMIN',
                locationId: 'loc-1',
                userName: 'Admin',
            },
        });
        mocks.saveSiiConfigurationMock.mockResolvedValueOnce(SAFE_SUMMARY);

        const certificateFile = new File([Uint8Array.from([1, 2, 3])], 'certificado.pfx', {
            type: 'application/x-pkcs12',
        });

        const formData = new FormData();
        formData.set('certificate', certificateFile);
        formData.set('certificatePassword', 'clave-secreta');
        formData.set('rut_emisor', SAFE_SUMMARY.rut_emisor);
        formData.set('razon_social', SAFE_SUMMARY.razon_social);
        formData.set('giro', SAFE_SUMMARY.giro);
        formData.set('acteco', String(SAFE_SUMMARY.acteco));
        formData.set('ambiente', SAFE_SUMMARY.ambiente);

        const response = await POST(buildPostRequest(formData));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.data).toEqual(SAFE_SUMMARY);
        expect(payload.data).not.toHaveProperty('certificatePfxBase64');
        expect(payload.data).not.toHaveProperty('certificatePassword');
        expect(mocks.saveSiiConfigurationMock).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: 'admin-1',
                certificatePassword: 'clave-secreta',
                rutEmisor: SAFE_SUMMARY.rut_emisor,
                razonSocial: SAFE_SUMMARY.razon_social,
                giro: SAFE_SUMMARY.giro,
                acteco: SAFE_SUMMARY.acteco,
                ambiente: SAFE_SUMMARY.ambiente,
            })
        );

        const saveCall = mocks.saveSiiConfigurationMock.mock.calls[0]?.[0] as {
            certificateFile?: File | null;
        };
        expect(saveCall.certificateFile).toBeInstanceOf(File);
        expect(saveCall.certificateFile?.name).toBe('certificado.pfx');
        expect(saveCall.certificateFile?.type).toBe('application/x-pkcs12');
    });

    it('GET devuelve sólo resumen seguro del certificado', async () => {
        mocks.requireApiRolesMock.mockResolvedValueOnce({
            ok: true,
            session: {
                userId: 'gg-1',
                role: 'GERENTE_GENERAL',
                locationId: 'loc-1',
                userName: 'Gerente General',
            },
        });
        mocks.getSiiConfigurationSummaryMock.mockResolvedValueOnce(SAFE_SUMMARY);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.data).toEqual(SAFE_SUMMARY);
        expect(mocks.requireApiRolesMock).toHaveBeenCalledWith(['ADMIN', 'GERENTE_GENERAL']);
        expect(payload.data).not.toHaveProperty('certificatePfxBase64');
        expect(payload.data).not.toHaveProperty('certificatePassword');
    });
});
