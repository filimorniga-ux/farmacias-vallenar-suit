
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateRestockSuggestionSecure } from './procurement-v2';
import { pool } from '@/lib/db';

// Mock DB
vi.mock('@/lib/db', () => ({
    pool: {
        query: vi.fn()
    }
}));

describe('Procurement V2 Logic', () => {
    // Valid v4 UUID
    const mockSupplierId = 'd290f1ee-6c54-4b01-90e6-d701748f0851';

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should calculate suggested quantity correctly based on formula', async () => {
        // Setup mock data
        (pool.query as any).mockResolvedValue({
            rows: [
                {
                    product_id: 'prod-1',
                    product_name: 'Paracetamol',
                    sku: 'PARA500',
                    current_stock: 10,
                    daily_velocity: 2.0, // 2 items sold per day
                    safety_stock: 5,
                    incoming_stock: 0,
                    unit_cost: 100,
                    suggested_quantity: 0
                }
            ]
        });

        const daysToCover = 10;
        const res = await generateRestockSuggestionSecure(mockSupplierId, daysToCover, 30);

        if (!res.success) {
            console.error('Test failed with:', res.error);
        }
        expect(res.success).toBe(true);
        if (!res.data) throw new Error('No data returned');

        const item = res.data[0];

        // Formula: CEIL(Velocity * DaysToCover + Safety - Stock - Incoming)
        // Expected: 2.0 * 10 + 5 - 10 - 0 = 15
        expect(item.suggested_quantity).toBe(15);
        expect(item.days_coverage).toBe('5.0');
    });

    it('should return 0 suggestion if stock is sufficient', async () => {
        (pool.query as any).mockResolvedValue({
            rows: [
                {
                    product_id: 'prod-2',
                    current_stock: 100,
                    daily_velocity: 1.0,
                    safety_stock: 10,
                    incoming_stock: 0,
                    unit_cost: 100
                }
            ]
        });

        const res = await generateRestockSuggestionSecure(mockSupplierId, 15, 30);
        expect(res.data![0].suggested_quantity).toBe(0);
    });

    it('should account for incoming stock', async () => {
        (pool.query as any).mockResolvedValue({
            rows: [
                {
                    product_id: 'prod-3',
                    current_stock: 5,
                    daily_velocity: 2.0,
                    safety_stock: 5,
                    incoming_stock: 20,
                    unit_cost: 100
                }
            ]
        });

        const res = await generateRestockSuggestionSecure(mockSupplierId, 10, 30);
        expect(res.data![0].suggested_quantity).toBe(0);
    });

    it('should include location filters in SQL query', async () => {
        (pool.query as any).mockResolvedValue({ rows: [] });

        await generateRestockSuggestionSecure(mockSupplierId, 15, 30, 'loc-123');

        expect(pool.query).toHaveBeenCalled();
        const calledSql = (pool.query as any).mock.calls[0][0];
        const calledParams = (pool.query as any).mock.calls[0][1];

        // locationId is the 3rd param because daysToCover ($3 in old query) is not in params anymore, 
        // params are [supplier, analysisWindow, locationId?]
        expect(calledSql).toContain('warehouse_id = $3');
        expect(calledSql).toContain('s.location_id = $3');
        expect(calledParams).toContain('loc-123');
    });
});
