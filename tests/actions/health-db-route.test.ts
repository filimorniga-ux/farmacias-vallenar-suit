import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/db/route';
import * as dbModule from '@/lib/db';
import * as dbErrorsModule from '@/lib/db-errors';

vi.mock('@/lib/db', () => ({
    query: vi.fn(),
    pool: {
        totalCount: 5,
        idleCount: 3,
        waitingCount: 1,
    }
}));

vi.mock('@/lib/db-errors', () => ({
    classifyPgError: vi.fn(),
}));

vi.mock('@/lib/action-response', () => ({
    createCorrelationId: vi.fn(() => 'corr-health-test'),
}));

vi.mock('@/lib/logger', () => ({
    logger: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
    }
}));

vi.mock('@sentry/nextjs', () => ({
    captureException: vi.fn(),
}));

function createRequest(input: {
    tokenHeader?: string;
    tokenQuery?: string;
}) {
    const searchParams = new URLSearchParams();
    if (input.tokenQuery) {
        searchParams.set('token', input.tokenQuery);
    }

    return {
        headers: {
            get: (key: string) => {
                if (key.toLowerCase() === 'x-health-token') {
                    return input.tokenHeader || null;
                }
                return null;
            }
        },
        nextUrl: { searchParams }
    } as any;
}

describe('GET /api/health/db', () => {
    const originalToken = process.env.HEALTHCHECK_TOKEN;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.HEALTHCHECK_TOKEN = 'test-health-token';
    });

    it('retorna 401 cuando no trae token válido', async () => {
        const response = await GET(createRequest({}));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('HEALTH_UNAUTHORIZED');
    });

    it('retorna estado ok con métricas de pool y latencia', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{
                server_time: new Date('2026-02-21T10:00:00.000Z').toISOString(),
            }],
            rowCount: 1
        } as any);

        const response = await GET(createRequest({ tokenHeader: 'test-health-token' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(true);
        expect(payload.status).toBe('ok');
        expect(payload.dbLatencyMs).toBeTypeOf('number');
        expect(payload.database).toBeUndefined();
        expect(payload.dbUser).toBeUndefined();
        expect(payload.pool).toBeUndefined();
        expect(payload.env).toBeUndefined();
    });

    it('retorna 503 degradado cuando falla la DB y usa clasificación tipada', async () => {
        vi.mocked(dbModule.query).mockRejectedValueOnce(new Error('Connection terminated due to connection timeout'));
        vi.mocked(dbErrorsModule.classifyPgError).mockReturnValueOnce({
            code: 'DB_TIMEOUT',
            retryable: true,
            technicalMessage: 'Connection terminated due to connection timeout',
            userMessage: 'Servicio temporalmente no disponible. Intente nuevamente en unos minutos.',
        });

        const response = await GET(createRequest({ tokenHeader: 'test-health-token' }));
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.status).toBe('degraded');
        expect(payload.code).toBe('DB_TIMEOUT');
        expect(payload.retryable).toBe(true);
        expect(payload.correlationId).toBe('corr-health-test');
        expect(payload.userMessage).toBe('Servicio temporalmente no disponible. Intente nuevamente en unos minutos.');
        expect(payload.technicalMessage).toBeUndefined();
    });

    it('rechaza token por query aunque coincida con el secreto configurado', async () => {
        const response = await GET(createRequest({ tokenQuery: 'test-health-token' }));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.code).toBe('HEALTH_UNAUTHORIZED');
    });

    afterAll(() => {
        if (originalToken === undefined) {
            delete process.env.HEALTHCHECK_TOKEN;
        } else {
            process.env.HEALTHCHECK_TOKEN = originalToken;
        }
    });
});
