import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import { pool } from '@/lib/db';

vi.mock('@/lib/db', () => ({
    pool: {
        query: vi.fn(),
        totalCount: 4,
        idleCount: 2,
        waitingCount: 1,
    },
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
            },
        },
        nextUrl: { searchParams },
    } as any;
}

describe('GET /api/health', () => {
    const originalToken = process.env.HEALTHCHECK_TOKEN;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.HEALTHCHECK_TOKEN = 'test-health-token';
        vi.mocked(pool.query).mockResolvedValueOnce({ rows: [], rowCount: 1 } as never);
    });

    afterAll(() => {
        if (originalToken === undefined) {
            delete process.env.HEALTHCHECK_TOKEN;
        } else {
            process.env.HEALTHCHECK_TOKEN = originalToken;
        }
    });

    it('rechaza acceso sin token válido', async () => {
        const response = await GET(createRequest({}));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('HEALTH_UNAUTHORIZED');
    });

    it('permite acceso autorizado y devuelve métricas', async () => {
        const response = await GET(createRequest({ tokenHeader: 'test-health-token' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.status).toBe('healthy');
        expect(payload.database.connected).toBe(true);
        expect(payload.database.latencyMs).toBeTypeOf('number');
        expect(payload.environment).toBeUndefined();
        expect(payload.uptime).toBeUndefined();
        expect(payload.version).toBeUndefined();
        expect(payload.database.poolTotal).toBeUndefined();
        expect(payload.database.poolIdle).toBeUndefined();
        expect(payload.database.poolWaiting).toBeUndefined();
    });

    it('mantiene no-store cuando la DB falla', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.mocked(pool.query).mockReset();
        vi.mocked(pool.query).mockRejectedValueOnce(new Error('db unavailable') as never);

        try {
            const response = await GET(createRequest({ tokenHeader: 'test-health-token' }));
            const payload = await response.json();

            expect(response.status).toBe(503);
            expect(response.headers.get('Cache-Control')).toContain('no-store');
            expect(payload.status).toBe('unhealthy');
            expect(payload.error).toBe('Database connection failed');
            expect(consoleErrorSpy).toHaveBeenCalled();
        } finally {
            consoleErrorSpy.mockRestore();
        }
    });

    it('rechaza token por query para evitar filtrarlo en logs o historial', async () => {
        const response = await GET(createRequest({ tokenQuery: 'test-health-token' }));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(response.headers.get('Cache-Control')).toContain('no-store');
        expect(payload.code).toBe('HEALTH_UNAUTHORIZED');
    });
});
