import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    poolConnectMock: vi.fn(),
    poolOnMock: vi.fn(),
    poolQueryMock: vi.fn(),
    poolEndMock: vi.fn(),
    poolConstructorMock: vi.fn(),
}));

vi.mock('pg', () => ({
    Pool: mocks.poolConstructorMock.mockImplementation(function Pool() {
        return {
        connect: mocks.poolConnectMock,
        on: mocks.poolOnMock,
        query: mocks.poolQueryMock,
        end: mocks.poolEndMock,
        totalCount: 0,
        idleCount: 0,
        waitingCount: 0,
        };
    }),
}));

vi.mock('@/lib/db-errors', () => ({
    isTransientPgConnectionError: vi.fn(() => false),
}));

vi.mock('@/lib/db-config', () => ({
    resolveDbPoolMax: vi.fn(() => 10),
}));

describe('db test mode hygiene', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        vi.stubEnv('NODE_ENV', 'test');
        vi.stubEnv('VITEST', 'true');
        vi.stubEnv('DATABASE_URL', 'postgres://test:test@localhost:5432/test_db_mock');
        delete (globalThis as typeof globalThis & { postgresPool?: unknown }).postgresPool;
    });

    it('no abre conexion ni imprime trazas al importar db en Vitest', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await import('../../src/lib/db');

        expect(mocks.poolConstructorMock).toHaveBeenCalledTimes(1);
        expect(mocks.poolConnectMock).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});
