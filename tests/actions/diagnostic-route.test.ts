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

    const MockPgClient = vi.fn(function MockPgClient() {
        return mockClientInstance;
    });

    return {
        mockClientInstance,
        MockPgClient,
    };
});

vi.mock('pg', () => ({
    Client: MockPgClient,
}));

vi.mock('node:dns', () => ({
    promises: {
        lookup: vi.fn().mockResolvedValue([{ address: '127.0.0.1', family: 4 }]),
    },
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
    const originalPostgresUrlNonPooling = process.env.POSTGRES_URL_NON_POOLING;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.POSTGRES_URL_NON_POOLING;
        process.env.DATABASE_URL = 'postgres://user:secret@db.example.com:5432/farmacias';
        mockClientInstance.end.mockResolvedValue(undefined);
    });

    afterAll(() => {
        if (originalDatabaseUrl === undefined) {
            delete process.env.DATABASE_URL;
        } else {
            process.env.DATABASE_URL = originalDatabaseUrl;
        }

        if (originalPostgresUrlNonPooling === undefined) {
            delete process.env.POSTGRES_URL_NON_POOLING;
        } else {
            process.env.POSTGRES_URL_NON_POOLING = originalPostgresUrlNonPooling;
        }
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
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mockClientInstance.end).not.toHaveBeenCalled();
    });

    it('rechaza requests sin sesión activa antes de construir cliente DB', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce(null);

        const response = await GET(new Request('http://localhost/api/diagnostic'));
        const payload = await response.json();

        expect(response.status).toBe(401);
        expect(payload.code).toBe('AUTH_UNAUTHORIZED');
        expect(MockPgClient).not.toHaveBeenCalled();
    });

    it('rechaza MANAGER antes de construir cliente DB porque el diagnóstico es administrativo', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'manager-1',
            role: 'MANAGER',
            locationId: 'loc-1',
            userName: 'Gerente',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await GET(new Request('http://localhost/api/diagnostic'));
        const payload = await response.json();

        expect(response.status).toBe(403);
        expect(payload.code).toBe('AUTH_FORBIDDEN');
        expect(MockPgClient).not.toHaveBeenCalled();
    });

    it('rechaza timeout fuera de rango antes de conectar', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await GET(new Request('http://localhost/api/diagnostic?timeout=999999'));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            success: false,
            error: 'Parámetro timeout inválido',
            code: 'DIAGNOSTIC_INVALID_TIMEOUT',
        });
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(MockPgClient).not.toHaveBeenCalled();
    });

    it('rechaza mode desconocido antes de conectar', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await GET(new Request('http://localhost/api/diagnostic?mode=debug'));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload).toEqual({
            success: false,
            error: 'Parámetro mode inválido',
            code: 'DIAGNOSTIC_INVALID_MODE',
        });
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(MockPgClient).not.toHaveBeenCalled();
    });

    it('falla cerrado si no hay target DB configurado para diagnóstico', async () => {
        delete process.env.DATABASE_URL;
        delete process.env.POSTGRES_URL_NON_POOLING;
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await GET(new Request('http://localhost/api/diagnostic'));
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(payload).toEqual({
            success: false,
            error: 'Base de datos no configurada para diagnóstico',
            code: 'DIAGNOSTIC_DB_URL_MISSING',
        });
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(MockPgClient).not.toHaveBeenCalled();
    });

    it('redacta target inválido en mode=parse sin construir cliente DB', async () => {
        process.env.DATABASE_URL = 'not-a-valid-url';
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });

        const response = await GET(new Request('http://localhost/api/diagnostic?mode=parse'));
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(payload).toEqual({
            success: false,
            error: 'Target de diagnóstico inválido',
            code: 'DIAGNOSTIC_DB_URL_INVALID',
        });
        expect(JSON.stringify(payload)).not.toContain('not-a-valid-url');
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(MockPgClient).not.toHaveBeenCalled();
    });

    it('prioriza POSTGRES_URL_NON_POOLING para el diagnóstico DB', async () => {
        process.env.DATABASE_URL = 'postgres://user:secret@pooler.example.com:6543/farmacias';
        process.env.POSTGRES_URL_NON_POOLING = 'postgres://user:secret@direct.example.com:5432/farmacias';
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockClientInstance.connect.mockResolvedValueOnce(undefined);
        mockClientInstance.query.mockResolvedValueOnce({
            rows: [{ now: '2026-05-06T12:00:00.000Z' }],
        });

        const response = await GET(new Request('http://localhost/api/diagnostic'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(MockPgClient).toHaveBeenCalledWith(expect.objectContaining({
            connectionString: 'postgres://user:secret@direct.example.com:5432/farmacias',
        }));
    });

    it('cierra el cliente si la consulta falla después de conectar', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockClientInstance.connect.mockResolvedValueOnce(undefined);
        mockClientInstance.query.mockRejectedValueOnce(new Error('query timeout after connect'));

        const response = await GET(new Request('http://localhost/api/diagnostic?timeout=5000'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(false);
        expect(payload.error).toBe('No fue posible completar el diagnóstico de base de datos');
        expect(payload.requestedConfig.timeoutMs).toBe(5000);
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
    });

    it('cierra el cliente en diagnóstico exitoso', async () => {
        vi.mocked(getValidatedSession).mockResolvedValueOnce({
            userId: 'admin-1',
            role: 'ADMIN',
            locationId: 'loc-1',
            userName: 'Admin',
            tokenVersion: 1,
            sessionToken: 'token',
        });
        mockClientInstance.connect.mockResolvedValueOnce(undefined);
        mockClientInstance.query.mockResolvedValueOnce({
            rows: [{ now: '2026-05-06T12:00:00.000Z' }],
        });

        const response = await GET(new Request('http://localhost/api/diagnostic?mode=default&timeout=1000'));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.success).toBe(true);
        expect(payload.now).toBe('2026-05-06T12:00:00.000Z');
        expect(response.headers.get('cache-control')).toContain('no-store');
        expect(mockClientInstance.end).toHaveBeenCalledTimes(1);
    });
});
