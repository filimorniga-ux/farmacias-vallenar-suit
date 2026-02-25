import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    generateRestockSuggestionSecure,
    createPurchaseOrderSecure,
    approvePurchaseOrderSecure,
    cancelPurchaseOrderSecure,
    receivePurchaseOrderSecure,
    deletePurchaseOrderSecure,
    getSuggestionAnalysisHistorySecure,
    getPurchaseOrderHistory
} from '@/actions/procurement-v2';
import * as dbModule from '@/lib/db';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('bcryptjs', () => ({
    compare: vi.fn(async (p: string, h: string) => h === `hashed_${p}`)
}));

// Mock DB
vi.mock('@/lib/db', () => ({
    pool: {
        query: vi.fn(),
        connect: vi.fn()
    }
}));

describe('Procurement V2 Logic', () => {
    // Valid v4 UUIDs
    const mockSupplierId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';
    const validUuid = '550e8400-e29b-41d4-a716-446655440111';
    const orderId = '550e8400-e29b-41d4-a716-446655440222';
    const approverId = '550e8400-e29b-41d4-a716-446655440333';

    // Mock Client Structure
    const mockClient = {
        query: vi.fn(),
        release: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // --- Suggestion Tests ---
    describe('Restock Suggestions', () => {
        it('should calculate suggested quantity correctly', async () => {
            vi.mocked(dbModule.pool.query).mockResolvedValue({
                rows: [{
                    product_id: 'prod-1', product_name: 'Paracetamol', sku: 'PARA500',
                    current_stock: 10, other_warehouses_stock: 0,
                    sold_7d: 14, sold_15d: 30, sold_30d: 60, sold_60d: 120, sold_90d: 180, sold_180d: 360, sold_365d: 730,
                    safety_stock: 5, incoming_stock: 0,
                    unit_cost: 100, internal_cost: 100,
                    suppliers_data: null, stock_by_location: [],
                    total_sold_in_period: 60, sales_history: []
                }]
            } as any);

            const res = await generateRestockSuggestionSecure(mockSupplierId, 10, 30);
            expect(res.success).toBe(true);
            // Formula: velocity=60/30=2.0, maxStock=ceil(2.0*10+5)=25, net=25-10-0=15
            expect(res.data![0].suggested_order_qty).toBe(15);
        });

        it('should fail with invalid supplier UUID', async () => {
            const res = await generateRestockSuggestionSecure('invalid-uuid');
            expect(res.success).toBe(false);
        });

        it('should load suggestion analysis history with mapped values', async () => {
            vi.mocked(dbModule.pool.query).mockResolvedValue({
                rows: [{
                    history_id: 'hist-1',
                    executed_at: '2026-02-18T12:00:00.000Z',
                    executed_by: 'Manager',
                    location_id: validUuid,
                    location_name: 'Sucursal Centro',
                    supplier_id: mockSupplierId,
                    supplier_name: 'Proveedor Uno',
                    days_to_cover: 15,
                    analysis_window: 30,
                    stock_threshold: 0.25,
                    search_query: 'PARA500',
                    limit_value: 100,
                    total_results: 40,
                    critical_count: 5,
                    transfer_count: 7,
                    total_estimated: 12345
                }]
            } as any);

            const res = await getSuggestionAnalysisHistorySecure({ locationId: validUuid, limit: 10 });

            expect(res.success).toBe(true);
            expect(res.data?.[0]).toMatchObject({
                history_id: 'hist-1',
                location_id: validUuid,
                supplier_id: mockSupplierId,
                total_results: 40,
                critical_count: 5,
                transfer_count: 7,
                total_estimated: 12345
            });
            expect(dbModule.pool.query).toHaveBeenCalledWith(expect.stringContaining("REPORT_GENERATE"), [10, validUuid]);
        });

        it('should ignore legacy non-uuid location id in suggestions query', async () => {
            vi.mocked(dbModule.pool.query).mockResolvedValue({
                rows: [{
                    product_id: 'prod-2',
                    product_name: 'Ibuprofeno',
                    sku: 'IBU400',
                    current_stock: 20,
                    other_warehouses_stock: 10,
                    sold_7d: 7,
                    sold_15d: 15,
                    sold_30d: 30,
                    sold_60d: 60,
                    sold_90d: 90,
                    sold_180d: 180,
                    sold_365d: 365,
                    safety_stock: 5,
                    incoming_stock: 0,
                    unit_cost: 100,
                    internal_cost: 100,
                    suppliers_data: null,
                    stock_by_location: [],
                    total_sold_in_period: 30,
                    sales_history: []
                }]
            } as any);

            const res = await generateRestockSuggestionSecure(undefined, 10, 30, 'BODEGA_CENTRAL', undefined, undefined, 20);

            expect(res.success).toBe(true);
            const params = vi.mocked(dbModule.pool.query).mock.calls[0]?.[1] as unknown[];
            expect(params).not.toContain('BODEGA_CENTRAL');
        });
    });

    // --- Create PO Tests ---
    describe('Create Purchase Order', () => {
        it('should return requiresApproval for large orders', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                if (sql.includes('FROM suppliers')) return { rows: [{ id: validUuid, name: 'Supplier' }] };
                if (sql.includes('FROM warehouses')) return { rows: [{ id: 'wh-1' }] };
                return { rows: [] };
            });

            const res = await createPurchaseOrderSecure({
                supplierId: validUuid, userId: validUuid,
                items: [{ productId: validUuid, productName: 'Expensive', quantity: 1000, unitCost: 600 }]
            } as any);

            expect(res.success).toBe(true);
            expect(res.data?.requiresApproval).toBe(true);
            expect(res.data?.total).toBe(600000);
        });
    });

    // --- Approve & Cancel Tests ---
    describe('Approve & Cancel Purchase Order', () => {
        it('should fail approval with incorrect PIN', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                if (sql.includes('FROM purchase_orders')) return { rows: [{ id: orderId, status: 'DRAFT', total_estimated: 100000 }] };
                // Return user but simulate failed check handled by mocked bcrypt or logic
                if (sql.includes('FROM users')) return { rows: [{ id: approverId, access_pin_hash: 'hashed_1234' }] };
                return { rows: [] };
            });

            const res = await approvePurchaseOrderSecure({
                orderId, approverPin: '9999', notes: 'Esta nota es suficientemente larga para pasar la validación'
            });

            // Since we mocked bcrypt.compare to check 'hashed_' + pin, hashed_1234 vs 9999 (hashed_9999) fails
            expect(res.success).toBe(false);
            expect(res.error).toContain('PIN inválido');
        });

        it('should prevent cancelling an already RECEIVED order', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                if (sql.includes('FROM purchase_orders')) {
                    return { rows: [{ id: orderId, status: 'RECEIVED' }] };
                }
                return { rows: [] };
            });

            const res = await cancelPurchaseOrderSecure({
                orderId, reason: 'Razón de cancelación suficientemente larga', cancelerPin: '1234'
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('no puede ser cancelada');
        });
    });

    // --- NEW: Receive PO Tests ---
    describe('Receive Purchase Order', () => {
        const itemUuid = '550e8400-e29b-41d4-a716-446655440444';

        it('should receive items successfully and update inventory', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                if (sql.startsWith('ROLLBACK')) return { rows: [] };
                if (sql.startsWith('COMMIT')) return { rows: [] };

                // 1. Get Order
                if (sql.includes('FROM purchase_orders'))
                    return {
                        rows: [{
                            id: orderId,
                            status: 'APPROVED',
                            target_warehouse_id: '550e8400-e29b-41d4-a716-446655440201',
                            supplier_id: 'sup-1'
                        }]
                    };
                if (sql.includes('SELECT location_id FROM warehouses WHERE id = $1'))
                    return { rows: [{ location_id: '550e8400-e29b-41d4-a716-446655440202' }] };
                // 2. Get Item
                if (sql.includes('FROM purchase_order_items'))
                    return { rows: [{ id: itemUuid, sku: 'SKU1', name: 'Test Product', cost_price: 100 }] };
                // 3. Get canonical product by SKU
                if (sql.includes('FROM products p') && sql.includes('p.sku = $1'))
                    return { rows: [{ id: '550e8400-e29b-41d4-a716-446655440203', name: 'Test Product', sale_price: 150, cost_price: 100 }] };
                // 4. Check Batch (exists)
                if (sql.includes('FROM inventory_batches')) return { rows: [{ id: 'batch-1', quantity_real: 10 }] };

                // Updates/Inserts (catch-all for UPDATE and trimmed INSERT)
                const trimmed = sql.trim();
                if (trimmed.startsWith('UPDATE') || trimmed.startsWith('INSERT')) return { rows: [], rowCount: 1 };

                return { rows: [] };
            });

            const res = await receivePurchaseOrderSecure({
                orderId,
                userId: validUuid,
                receivedItems: [{ itemId: itemUuid, quantityReceived: 5 }]
            });

            if (!res.success) console.error('Test Create Error:', res.error);
            expect(res.success).toBe(true);

            // Verify DB interactions
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE purchase_orders'), expect.anything());
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE inventory_batches'), expect.anything());
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO stock_movements'), expect.anything());
        });

        it('should fail if order is not APPROVED', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                if (sql.includes('FROM purchase_orders'))
                    return { rows: [{ id: orderId, status: 'DRAFT' }] };
                return { rows: [] };
            });

            const res = await receivePurchaseOrderSecure({
                orderId, userId: validUuid, receivedItems: []
            });

            expect(res.success).toBe(false);
            expect(res.error).toContain('debe estar aprobada');
        });
    });

    // --- NEW: Delete Draft Tests ---
    describe('Delete Purchase Order', () => {
        it('should delete a DRAFT order successfully', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                // Get Order
                if (sql.includes('FROM purchase_orders'))
                    return { rows: [{ id: orderId, status: 'DRAFT', location_id: 'loc-1' }] };
                return { rows: [] };
            });

            const res = await deletePurchaseOrderSecure({ orderId, userId: validUuid });

            expect(res.success).toBe(true);
            // Check deletes
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM purchase_order_items'), expect.anything());
            expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM purchase_orders'), expect.anything());
        });

        it('should fail to delete an APPROVED order', async () => {
            vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);
            mockClient.query.mockImplementation(async (sql: string) => {
                if (sql.startsWith('BEGIN')) return { rows: [] };
                if (sql.includes('FROM purchase_orders'))
                    return { rows: [{ id: orderId, status: 'APPROVED' }] };
                return { rows: [] };
            });

            const res = await deletePurchaseOrderSecure({ orderId, userId: validUuid });

            expect(res.success).toBe(false);
            expect(res.error).toContain('Solo se pueden eliminar borradores');
        });
    });

    describe('Purchase Order History Query', () => {
        it('should qualify status filter with po alias to avoid ambiguity', async () => {
            vi.mocked(dbModule.pool.query)
                .mockResolvedValueOnce({ rows: [{ total: '0' }] } as any)
                .mockResolvedValueOnce({ rows: [] } as any);

            const res = await getPurchaseOrderHistory({
                status: 'APPROVED',
                page: 1,
                pageSize: 20
            });

            expect(res.success).toBe(true);
            const countSql = String(vi.mocked(dbModule.pool.query).mock.calls[0]?.[0] || '');
            expect(countSql).toContain('FROM purchase_orders po');
            expect(countSql).toContain('po.status = $1');
        });
    });
});
