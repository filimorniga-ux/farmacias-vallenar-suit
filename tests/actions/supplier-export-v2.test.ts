
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as actionModule from '@/actions/supplier-export-v2';
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
    // Default success mock
    mockCookies.get.mockImplementation((key) => {
        if (key === 'user_id') return { value: '550e8400-e29b-41d4-a716-446655440001' };
        if (key === 'user_role') return { value: 'MANAGER' };
        if (key === 'x-user-location') return { value: 'loc-1' };
        return undefined;
    });
});

describe('Supplier Export V2', () => {
    describe('generateSupplierReportSecure', () => {
        it('should success with valid session', async () => {
            const result = await actionModule.generateSupplierReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });

        it('should fail authentication if session is missing', async () => {
            mockCookies.get.mockImplementation((key: string) => undefined);
            const result = await actionModule.generateSupplierReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(false);
            expect(result.error).toBe('No autenticado');
        });

        it('should fail if user has insufficient permissions (GUEST)', async () => {
            mockCookies.get.mockImplementation((key: string) => {
                if (key === 'user_id') return { value: 'user-1' };
                if (key === 'user_role') return { value: 'GUEST' };
                return undefined;
            });
            const result = await actionModule.generateSupplierReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(false);
            expect(result.error).toContain('Solo administradores');
        });

        it('should handle database errors gracefully', async () => {
            vi.mocked(dbModule.query).mockRejectedValueOnce(new Error('DB connection failed'));
            const result = await actionModule.generateSupplierReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Error generando reporte');
        });

        it('should handle empty supplier list correctly', async () => {
            vi.mocked(dbModule.query).mockResolvedValue({ rows: [], rowCount: 0, command: '', oid: 0, fields: [] });
            const result = await actionModule.generateSupplierReportSecure({ startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(true);
            expect(result.data).toBeDefined();
        });
    });

    describe('exportPOHistorySecure', () => {
        it('should export PO history successfully', async () => {
            vi.mocked(dbModule.query).mockResolvedValue({
                rows: [{ id: 'po-1', created_at: new Date(), status: 'COMPLETED', total_estimated: 1000, business_name: 'Sup 1' }],
                rowCount: 1, command: '', oid: 0, fields: []
            });
            const result = await actionModule.exportPOHistorySecure('sup-1', { startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(true);
            expect(result.filename).toContain('OC_Historial');
        });

        it('should fail PO history export if not authorized', async () => {
            mockCookies.get.mockImplementation((key: string) => {
                if (key === 'user_role') return { value: 'GUEST' };
                if (key === 'user_id') return { value: 'user-1' };
                return undefined;
            });
            const result = await actionModule.exportPOHistorySecure('sup-1', { startDate: '2024-01-01', endDate: '2024-01-31' });
            expect(result.success).toBe(false);
            expect(result.error).toBe('Solo administradores');
        });
    });
});
