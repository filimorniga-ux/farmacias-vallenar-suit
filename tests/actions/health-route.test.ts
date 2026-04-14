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
        expect(payload.success).toBe(false);
        expect(payload.code).toBe('HEALTH_UNAUTHORIZED');
    });

    it('permite acceso autorizado y devuelve métricas', async () => {
        const response = await GET(createRequest({ tokenHeader: 'test-health-token' }));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.status).toBe('healthy');
        expect(payload.database.poolTotal).toBe(4);
        expect(payload.database.poolIdle).toBe(2);
        expect(payload.database.poolWaiting).toBe(1);
    });
});
