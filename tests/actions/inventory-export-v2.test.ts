import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as actionModule from '@/actions/inventory-export-v2';
import * as dbModule from '@/lib/db';
import { getSessionSecure } from '@/actions/auth-v2';

const VALID_USER_ID = '550e8400-e29b-41d4-a716-446655440001';
const VALID_LOCATION_ID = '550e8400-e29b-41d4-a716-446655440010';

vi.mock('@/lib/db', () => ({
    query: vi.fn(() => Promise.resolve({ rows: [], rowCount: 0 })),
    pool: { connect: vi.fn() }
}));

vi.mock('@/actions/auth-v2', () => ({
    getSessionSecure: vi.fn(),
}));

vi.mock('@/lib/excel-generator', () => ({
    ExcelService: class {
        generateReport = vi.fn().mockResolvedValue(Buffer.from('test'));
    }
}));

vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

describe('Inventory Export V2', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(getSessionSecure).mockResolvedValue({
            userId: VALID_USER_ID,
            role: 'MANAGER',
            userName: 'Test User',
            locationId: VALID_LOCATION_ID,
            tokenVersion: 1,
            sessionToken: 'token',
        });
    });

    it('should export stock movements successfully', async () => {
        const mockedQuery = vi.mocked(dbModule.query);
        mockedQuery.mockImplementation(((sql: string) => {
            if (sql.includes('information_schema.columns')) {
                return Promise.resolve({
                    rows: [{ exists: true }],
                    rowCount: 1,
                });
            }

            if (sql.includes('FROM stock_movements sm')) {
                return Promise.resolve({
                    rows: [{
                        timestamp: new Date('2026-02-20T14:56:00.000Z'),
                        movement_type: 'TRANSFER_OUT',
                        quantity: -30,
                        stock_after: 69,
                        notes: 'Transfer #439199',
                        product_name: '3M TEGADERM',
                        sku: '0104064035142742',
                        user_name: 'Gerente General',
                        user_rut: '12.345.678-9',
                        location_name: 'Farmacia Vallenar Santiago',
                        origin_location_name: 'Bodega General',
                        destination_location_name: 'Farmacia Prat',
                        authorized_by_name: 'Gerente General 1',
                        received_by_name: 'Encargado Prat',
                        batch_lot_number: 'TRF-550E8400-001-TURQUESA',
                        batch_source_system: 'WMS_TRANSFER',
                        reference_id: '550e8400-e29b-41d4-a716-446655440888',
                        operation_scope: 'DESPACHO'
                    }],
                    rowCount: 1
                });
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        }) as any);

        const result = await actionModule.exportStockMovementsSecure({
            startDate: '2026-02-13',
            endDate: '2026-02-20',
            limit: 1000
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.filename).toContain('Kardex_Global_2026-02-13');
    });

    it('should query stock export with casted user join and corporate route fields', async () => {
        const mockedQuery = vi.mocked(dbModule.query);

        mockedQuery.mockImplementation(((sql: string) => {
            if (sql.includes('information_schema.columns')) {
                return Promise.resolve({
                    rows: [{ exists: true }],
                    rowCount: 1
                });
            }

            if (sql.includes('FROM stock_movements sm')) {
                return Promise.resolve({
                    rows: [{
                        timestamp: new Date('2026-02-20T14:56:00.000Z'),
                        movement_type: 'TRANSFER_OUT',
                        quantity: -30,
                        stock_after: 69,
                        notes: 'Transfer #439199',
                        product_name: '3M TEGADERM',
                        sku: '0104064035142742',
                        user_name: 'Gerente General',
                        user_rut: '12.345.678-9',
                        location_name: 'Farmacia Vallenar Santiago',
                        origin_location_name: 'Bodega General',
                        destination_location_name: 'Farmacia Prat',
                        authorized_by_name: 'Gerente General 1',
                        received_by_name: 'Encargado Prat',
                        batch_lot_number: 'TRF-550E8400-001-TURQUESA',
                        batch_source_system: 'WMS_TRANSFER',
                        reference_id: '550e8400-e29b-41d4-a716-446655440888',
                        operation_scope: 'DESPACHO'
                    }],
                    rowCount: 1
                });
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        }) as any);

        const result = await actionModule.exportStockMovementsSecure({
            startDate: '2026-02-13',
            endDate: '2026-02-20',
            movementType: 'TRANSFER_OUT',
            locationId: VALID_LOCATION_ID,
            limit: 1000
        });

        expect(result.success).toBe(true);

        const stockQueryCall = mockedQuery.mock.calls.find(([sql]) =>
            typeof sql === 'string' && sql.includes('FROM stock_movements sm')
        );

        expect(stockQueryCall).toBeDefined();
        const stockSql = String(stockQueryCall?.[0] || '');
        expect(stockSql).toContain('sm.user_id::text = u.id::text');
        expect(stockSql).toContain('origin_location_name');
        expect(stockSql).toContain('destination_location_name');
        expect(stockSql).toContain('operation_scope');
        expect(stockSql).toContain('LEFT JOIN inventory_batches ib ON sm.batch_id::text = ib.id::text');
        expect(stockSql).toContain("sh.transport_data->>'authorized_by_name'");
        expect(stockSql).toContain('batch_lot_number');
    });

    it('should apply invoice number filter to stock movement export', async () => {
        const mockedQuery = vi.mocked(dbModule.query);

        mockedQuery.mockImplementation(((sql: string) => {
            if (sql.includes('information_schema.columns')) {
                return Promise.resolve({
                    rows: [{ exists: true }],
                    rowCount: 1
                });
            }

            if (sql.includes('FROM stock_movements sm')) {
                return Promise.resolve({
                    rows: [],
                    rowCount: 0
                });
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        }) as any);

        const result = await actionModule.exportStockMovementsSecure({
            startDate: '2026-02-13',
            endDate: '2026-02-20',
            movementType: 'PURCHASE_ENTRY',
            locationId: VALID_LOCATION_ID,
            invoiceNumber: 'FAC-123',
            limit: 1000
        });

        expect(result.success).toBe(true);

        const stockQueryCall = mockedQuery.mock.calls.find(([sql]) =>
            typeof sql === 'string' && sql.includes('FROM stock_movements sm')
        );
        expect(stockQueryCall).toBeDefined();
        expect(String(stockQueryCall?.[0] || '')).toContain("COALESCE(sm.notes, '') ILIKE");
        expect(stockQueryCall?.[1]).toContain('%FAC-123%');
    });

    it('should return backend error details when both detailed and fallback queries fail', async () => {
        const mockedQuery = vi.mocked(dbModule.query);

        mockedQuery.mockImplementation(((sql: string) => {
            if (sql.includes('information_schema.columns')) {
                return Promise.resolve({
                    rows: [{ exists: true }],
                    rowCount: 1
                });
            }

            if (sql.includes('FROM stock_movements sm') && sql.includes('LEFT JOIN inventory_batches')) {
                throw new Error('column batch_source_system does not exist');
            }

            if (sql.includes('FROM stock_movements sm') && !sql.includes('LEFT JOIN inventory_batches')) {
                throw new Error('operator does not exist: uuid = character varying');
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        }) as any);

        const result = await actionModule.exportStockMovementsSecure({
            startDate: '2026-02-13',
            endDate: '2026-02-20',
            limit: 1000
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('operator does not exist: uuid = character varying');
    });

    it('should use legacy fallback query when detailed stock export query fails', async () => {
        const mockedQuery = vi.mocked(dbModule.query);

        mockedQuery.mockImplementation(((sql: string) => {
            if (sql.includes('information_schema.columns')) {
                return Promise.resolve({
                    rows: [{ exists: true }],
                    rowCount: 1
                });
            }

            if (sql.includes('FROM stock_movements sm') && sql.includes('LEFT JOIN inventory_batches')) {
                throw new Error('column ib.source_system does not exist');
            }

            if (sql.includes('FROM stock_movements sm') && !sql.includes('LEFT JOIN inventory_batches')) {
                return Promise.resolve({
                    rows: [{
                        timestamp: new Date('2026-02-20T14:56:00.000Z'),
                        movement_type: 'TRANSFER_OUT',
                        quantity: -30,
                        stock_after: 69,
                        notes: 'Transfer fallback',
                        product_name: '3M TEGADERM',
                        sku: '0104064035142742',
                        user_name: 'Gerente General',
                        user_rut: '12.345.678-9',
                        location_name: 'Farmacia Vallenar Santiago',
                        batch_lot_number: null,
                        batch_source_system: 'LEGACY',
                        reference_id: '550e8400-e29b-41d4-a716-446655440889',
                        operation_scope: 'TRANSFER_OUT'
                    }],
                    rowCount: 1
                });
            }

            return Promise.resolve({ rows: [], rowCount: 0 });
        }) as any);

        const result = await actionModule.exportStockMovementsSecure({
            startDate: '2026-02-13',
            endDate: '2026-02-20',
            movementType: 'TRANSFER_OUT',
            locationId: VALID_LOCATION_ID,
            limit: 1000
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();

        const stockQueryCalls = mockedQuery.mock.calls.filter(([sql]) =>
            typeof sql === 'string' && sql.includes('FROM stock_movements sm')
        );
        expect(stockQueryCalls.length).toBe(2);
    });
});
