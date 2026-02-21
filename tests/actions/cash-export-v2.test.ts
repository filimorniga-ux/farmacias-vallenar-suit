
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actionModule from '@/actions/cash-export-v2';
import * as dbModule from '@/lib/db';

const { mockGetSessionSecure } = vi.hoisted(() => ({
    mockGetSessionSecure: vi.fn()
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: mockGetSessionSecure
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
    ExcelService: class {
        generateReport = vi.fn().mockResolvedValue(Buffer.from('test'));
        generateMultiSheetReport = vi.fn().mockResolvedValue(Buffer.from('test'));
    }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionSecure.mockResolvedValue({
        userId: '550e8400-e29b-41d4-a716-446655440001',
        role: 'MANAGER',
        locationId: '550e8400-e29b-41d4-a716-446655440111',
        userName: 'Test User'
    });
});

describe('Cash Export V2', () => {
    it('should success', async () => {
        const result = await actionModule.generateCashReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31', locationId: 'loc-1', terminalId: 'term-1' });
        expect(result.success).toBe(true);
    });

    it('should fail authentication if headers/cookies missing', async () => {
        mockGetSessionSecure.mockResolvedValueOnce(null);
        const result = await actionModule.generateCashReportSecure({
            startDate: '2024-01-01',
            endDate: '2024-01-31'
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('No autenticado');
    });
});
