
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actionModule from '@/actions/finance-export-v2';
import * as dbModule from '@/lib/db';

const validUserId = '550e8400-e29b-41d4-a716-446655440001';

const { mockCookies } = vi.hoisted(() => ({
    mockCookies: {
        get: vi.fn((key) => {
            if (key === 'user_id') return { value: '550e8400-e29b-41d4-a716-446655440001' };
            if (key === 'user_role') return { value: 'MANAGER' };
            if (key === 'x-user-location') return { value: 'loc-1' };
            return undefined;
        })
    }
}));

vi.mock('next/headers', () => ({
    headers: vi.fn(() => Promise.resolve({ get: () => null })),
    cookies: vi.fn(() => Promise.resolve(mockCookies))
}));

vi.mock('@/lib/db', () => ({
    query: vi.fn((sql: string) => {
        if (typeof sql === 'string' && (sql.includes('FROM users') || sql.includes('FROM sessions'))) {
            return Promise.resolve({
                rows: [{ id: '550e8400-e29b-41d4-a716-446655440001', role: 'MANAGER', is_active: true, name: 'Test User', assigned_location_id: 'loc-1' }],
                rowCount: 1
            });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    pool: { connect: vi.fn() }
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class { generateReport = vi.fn().mockResolvedValue(Buffer.from('test')) }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
});

describe('Finance Export V2', () => {
    it('should export cash flow successfully during success path', async () => {
        vi.mocked(dbModule.query).mockResolvedValueOnce({
            rows: [{ id: '1', timestamp: new Date(), description: 'Venta', amount_in: 100 }],
            rowCount: 1, command: '', oid: 0, fields: []
        });

        const result = await actionModule.exportCashFlowSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(true);
        expect(typeof result.data).toBe('string');
        expect(result.filename).toContain('Flujo');
    });

    it('should fail authentication if headers/cookies missing', async () => {
        vi.mocked(mockCookies.get).mockReturnValueOnce(undefined);
        const result = await actionModule.exportCashFlowSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
        expect(result.success).toBe(false);
        expect(result.error).toContain('autenticado');
    });
});
