import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const {
    mockClientInstance,
    MockPgClient,
} = vi.hoisted(() => {
    const mockClientInstance = {
        connect: vi.fn(),
        query: vi.fn(),
        end: vi.fn(),
    };

    const MockPgClient = vi.fn(() => mockClientInstance);

    return {
        mockClientInstance,
        MockPgClient,
    };
});

vi.mock('pg', () => ({
    Client: MockPgClient,
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

import { GET } from '@/app/api/diagnostic/route';
import { getValidatedSession } from '@/lib/server-session';

describe('GET /api/diagnostic', () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.DATABASE_URL = 'postgres://user:secret@db.example.com:5432/farmacias';
    });

    afterAll(() => {
        process.env.DATABASE_URL = originalDatabaseUrl;
    });

    it('redacta detalles internos cuando falla la conexión', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockClientInstance.connect.mockRejectedValueOnce(new Error('connect ECONNREFUSED db.example.com:5432'));

        const response = await GET(new Request('http://localhost/api/diagnostic?mode=parse'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(false);
        expect(payload.error).toBe('No fue posible completar el diagnóstico de base de datos');
        expect(payload.stack).toBeUndefined();
        expect(payload.code).toBeUndefined();
        expect(payload.config_used).toBeUndefined();
        expect(payload.requestedConfig).toEqual({
            mode: 'parse',
            ssl: true,
            rejectUnauthorized: false,
            timeoutMs: 3000,
        });
    });
});
