import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/ai/deepseek-ocr/route';
import type { NextRequest } from 'next/server';

vi.mock('@/lib/logger', () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

const VALID_BODY = {
    model: 'deepseek-chat',
    fileType: 'image' as const,
    imageBase64: 'A'.repeat(200),
    prompt: 'Extrae datos de factura y responde en JSON.',
};

function buildRequest(
    body: unknown,
    headers: Record<string, string> = {}
): NextRequest {
    return new Request('http://localhost/api/ai/deepseek-ocr', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        body: JSON.stringify(body),
    }) as unknown as NextRequest;
}

describe('POST /api/ai/deepseek-ocr', () => {
    const originalEnv = {
        AI_DEEPSEEK_API_KEY: process.env.AI_DEEPSEEK_API_KEY,
        DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
        AI_INTERNAL_ENDPOINT_TOKEN: process.env.AI_INTERNAL_ENDPOINT_TOKEN,
        AI_DEEPSEEK_OCR_UPSTREAM_URL: process.env.AI_DEEPSEEK_OCR_UPSTREAM_URL,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('fetch', vi.fn());

        delete process.env.AI_DEEPSEEK_API_KEY;
        delete process.env.DEEPSEEK_API_KEY;
        delete process.env.AI_INTERNAL_ENDPOINT_TOKEN;
        delete process.env.AI_DEEPSEEK_OCR_UPSTREAM_URL;
    });

    afterEach(() => {
        if (originalEnv.AI_DEEPSEEK_API_KEY === undefined) {
            delete process.env.AI_DEEPSEEK_API_KEY;
        } else {
            process.env.AI_DEEPSEEK_API_KEY = originalEnv.AI_DEEPSEEK_API_KEY;
        }

        if (originalEnv.DEEPSEEK_API_KEY === undefined) {
            delete process.env.DEEPSEEK_API_KEY;
        } else {
            process.env.DEEPSEEK_API_KEY = originalEnv.DEEPSEEK_API_KEY;
        }

        if (originalEnv.AI_INTERNAL_ENDPOINT_TOKEN === undefined) {
            delete process.env.AI_INTERNAL_ENDPOINT_TOKEN;
        } else {
            process.env.AI_INTERNAL_ENDPOINT_TOKEN = originalEnv.AI_INTERNAL_ENDPOINT_TOKEN;
        }

        if (originalEnv.AI_DEEPSEEK_OCR_UPSTREAM_URL === undefined) {
            delete process.env.AI_DEEPSEEK_OCR_UPSTREAM_URL;
        } else {
            process.env.AI_DEEPSEEK_OCR_UPSTREAM_URL = originalEnv.AI_DEEPSEEK_OCR_UPSTREAM_URL;
        }

        vi.unstubAllGlobals();
    });

    it('bloquea acceso cuando se exige token interno y no se envía', async () => {
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';
        process.env.AI_DEEPSEEK_API_KEY = 'deepseek-test-key';

        const response = await POST(buildRequest(VALID_BODY));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('DEEPSEEK_OCR_UNAUTHORIZED');
    });

    it('falla cerrado cuando el token interno no está configurado', async () => {
        const response = await POST(buildRequest(VALID_BODY));
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('DEEPSEEK_OCR_NOT_CONFIGURED');
    });

    it('retorna error cuando falta API key en servidor y el token sí está configurado', async () => {
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';

        const response = await POST(buildRequest(VALID_BODY, {
            'x-internal-ocr-token': 'internal-secret',
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('DEEPSEEK_OCR_KEY_MISSING');
    });

    it('rechaza payloads declarados como demasiado grandes antes de parsear o llamar al proveedor', async () => {
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';

        const response = await POST(buildRequest(VALID_BODY, {
            'x-internal-ocr-token': 'internal-secret',
            'content-length': String((16 * 1024 * 1024) + 1),
        }));
        const payload = await response.json();

        expect(response.status).toBe(413);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('DEEPSEEK_OCR_PAYLOAD_TOO_LARGE');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('normaliza respuesta OpenAI-compatible a data JSON para el parser', async () => {
        process.env.AI_DEEPSEEK_API_KEY = 'deepseek-test-key';
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';

        const fetchMock = vi.mocked(global.fetch);
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    choices: [
                        {
                            message: {
                                content: '{"invoice_number":"F-123","totals":{"total":1000}}',
                            },
                        },
                    ],
                    usage: {
                        prompt_tokens: 10,
                        completion_tokens: 20,
                        total_tokens: 30,
                    },
                }),
                {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        );

        const response = await POST(buildRequest(VALID_BODY, {
            'x-internal-ocr-token': 'internal-secret',
        }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.data.invoice_number).toBe('F-123');
        expect(payload.usage.total_tokens).toBe(30);
        expect(fetchMock).toHaveBeenCalledTimes(1);

        const call = fetchMock.mock.calls[0];
        expect(call?.[0]).toBe('https://api.deepseek.com/chat/completions');
    });

    it('redacta errores del proveedor OCR en la respuesta pública', async () => {
        process.env.AI_DEEPSEEK_API_KEY = 'deepseek-test-key';
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';

        const fetchMock = vi.mocked(global.fetch);
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    error: 'invalid api key sk-secret-provider-detail',
                }),
                {
                    status: 401,
                    statusText: 'Unauthorized',
                    headers: { 'Content-Type': 'application/json' },
                }
            )
        );

        const response = await POST(buildRequest(VALID_BODY, {
            'x-internal-ocr-token': 'internal-secret',
        }));
        const payload = await response.json();

        expect(response.status).toBe(502);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('DEEPSEEK_OCR_UPSTREAM_ERROR');
        expect(payload.error).toBe('Proveedor OCR no disponible');
        expect(JSON.stringify(payload)).not.toContain('sk-secret-provider-detail');
        expect(payload.correlationId).toBeTypeOf('string');
    });

    it('redacta errores internos de fetch y conserva correlationId', async () => {
        process.env.AI_DEEPSEEK_API_KEY = 'deepseek-test-key';
        process.env.AI_INTERNAL_ENDPOINT_TOKEN = 'internal-secret';

        const fetchMock = vi.mocked(global.fetch);
        fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED internal-host:443'));

        const response = await POST(buildRequest(VALID_BODY, {
            'x-internal-ocr-token': 'internal-secret',
        }));
        const payload = await response.json();

        expect(response.status).toBe(500);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('DEEPSEEK_OCR_REQUEST_FAILED');
        expect(payload.error).toBe('No se pudo procesar OCR');
        expect(JSON.stringify(payload)).not.toContain('internal-host');
        expect(payload.correlationId).toBeTypeOf('string');
    });
});
