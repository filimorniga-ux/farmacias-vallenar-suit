
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deleteProductSecure } from '../../src/actions/delete-product';

// Mocks
const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockConnect = vi.fn(() => ({
    query: mockQuery,
    release: mockRelease,
}));

vi.mock('../../src/lib/db', () => ({
    pool: {
        connect: mockConnect
    },
    query: vi.fn()
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// Mock bcrypt robustly
const mockCompare = vi.fn();
vi.mock('bcryptjs', () => ({
    default: {
        compare: (...args: any[]) => mockCompare(...args),
    },
    compare: (...args: any[]) => mockCompare(...args),
}));

describe('deleteProductSecure (Check-First Strategy)', () => {
    const productId = '123e4567-e89b-12d3-a456-426614174000';
    const userId = '123e4567-e89b-12d3-a456-426614174001';
    const pin = '1234';

    beforeEach(() => {
        vi.clearAllMocks();
        mockCompare.mockResolvedValue(true);
        // Setup default mocks for happy path common parts
        // 1. BEGIN
        mockQuery.mockResolvedValueOnce({});
        // 2. Auth Check (Users query)
        mockQuery.mockResolvedValueOnce({
            rows: [{ id: 'admin-1', name: 'Admin', access_pin_hash: 'hashed_pin' }]
        });
    });

    it('should perform SOFT DELETE when product has sales history', async () => {
        // Arrange
        // 3. Check Dependencies -> RETURNS ROW (Has sales)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // 4. Update Product (Soft Delete)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // 5. Update Inventory Batches (Optional Soft Delete)
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // 6. Insert Audit Log
        mockQuery.mockResolvedValueOnce({});

        // 7. COMMIT
        mockQuery.mockResolvedValueOnce({});

        // Act
        const result = await deleteProductSecure(productId, userId, pin);

        // Assert
        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenLastCalledWith('COMMIT');

        // Verify Check Query was called
        const checkCall = mockQuery.mock.calls.find(call =>
            call[0].includes('SELECT 1') &&
            call[0].includes('FROM sale_items') &&
            call[0].includes('batch_id')
        );
        expect(checkCall).toBeDefined();

        // Verify UPDATE was called (Soft Delete)
        const updateCall = mockQuery.mock.calls.find(call =>
            call[0].includes('UPDATE products') &&
            call[0].includes('is_active = false')
        );
        expect(updateCall).toBeDefined();

        // Verify DELETE was NOT called
        const deleteCall = mockQuery.mock.calls.find(call =>
            call[0].startsWith('DELETE FROM')
        );
        expect(deleteCall).toBeUndefined();
    });

    it('should perform HARD DELETE when product has NO sales', async () => {
        // Arrange
        // 3. Check Dependencies -> RETURNS EMPTY (No sales)
        mockQuery.mockResolvedValueOnce({ rowCount: 0 });

        // 4. Delete Batches
        mockQuery.mockResolvedValueOnce({ rowCount: 0 });

        // 5. Delete Product
        mockQuery.mockResolvedValueOnce({ rowCount: 1 });

        // 6. Insert Audit Log
        mockQuery.mockResolvedValueOnce({});

        // 7. COMMIT
        mockQuery.mockResolvedValueOnce({});

        // Act
        const result = await deleteProductSecure(productId, userId, pin);

        // Assert
        expect(result.success).toBe(true);
        expect(mockQuery).toHaveBeenLastCalledWith('COMMIT');

        // Verify DELETE was called
        const deleteBatchesCall = mockQuery.mock.calls.find(call =>
            call[0].includes('DELETE FROM inventory_batches')
        );
        expect(deleteBatchesCall).toBeDefined();

        const deleteProductCall = mockQuery.mock.calls.find(call =>
            call[0].includes('DELETE FROM products')
        );
        expect(deleteProductCall).toBeDefined();
    });
});
