/**
 * Unit Tests - Locations V2 Module
 * Tests for secure location management, stock transfers, and user assignment
 */

import { describe, it, expect, vi } from 'vitest';
import * as locationsV2 from '@/actions/locations-v2';
import * as dbModule from '@/lib/db';
// Fixtures are imported but not all used; cleaning up unused ones to pass lint
import { } from '../fixtures';

// Valid UUIDs for tests
const VALID_UUID_ADMIN = '550e8400-e29b-41d4-a716-446655440100';
const VALID_UUID_MANAGER = '550e8400-e29b-41d4-a716-446655440101';
const VALID_UUID_LOC_1 = '550e8400-e29b-41d4-a716-446655440200';
const VALID_UUID_LOC_2 = '550e8400-e29b-41d4-a716-446655440201';
const VALID_UUID_USER_1 = '550e8400-e29b-41d4-a716-446655440300';
const VALID_UUID_BATCH_1 = '550e8400-e29b-41d4-a716-446655440400';

// Mock dependencies
vi.mock('@/lib/db', () => ({
    pool: {
        connect: vi.fn()
    },
    query: vi.fn()
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn()
}));

vi.mock('next/headers', () => {
    const mockHeaders = {
        get: vi.fn((name: string) => {
            if (name === 'x-user-id') return '550e8400-e29b-41d4-a716-446655440100';
            if (name === 'x-user-role') return 'ADMIN';
            return null;
        })
    };
    const mockCookies = {
        get: vi.fn((name: string) => {
            if (name === 'user_id') return { value: '550e8400-e29b-41d4-a716-446655440100' };
            if (name === 'user_role') return { value: 'ADMIN' };
            return null;
        })
    };
    return {
        headers: vi.fn(async () => mockHeaders),
        cookies: vi.fn(async () => mockCookies)
    };
});

vi.mock('bcryptjs', () => ({
    default: {
        compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`)
    },
    hash: vi.fn(async (password: string) => `hashed_${password}`),
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`)
}));

vi.mock('@/lib/rate-limiter', () => ({
    checkRateLimit: vi.fn(() => ({ allowed: true })),
    recordFailedAttempt: vi.fn(),
    resetAttempts: vi.fn()
}));

vi.mock('@/lib/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock('crypto', () => ({
    randomUUID: vi.fn(() => '550e8400-e29b-41d4-a716-446655440999')
}));

// Test data with VALID UUIDs
const mockAdmin = {
    id: VALID_UUID_ADMIN,
    name: 'Admin User',
    role: 'ADMIN',
    is_active: true
};

const mockManager = {
    id: VALID_UUID_MANAGER,
    name: 'Manager User',
    role: 'MANAGER',
    access_pin_hash: 'hashed_1234',
    is_active: true
};

const mockLocation = {
    id: VALID_UUID_LOC_1,
    name: 'Sucursal Centro',
    type: 'STORE',
    is_active: true
};


// RBAC tests - re-enabled
describe('Locations V2 - RBAC Enforcement', () => {
    it('should allow ADMIN to create location', async () => {
        createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Auth
            { rows: [], rowCount: 0 }, // Duplicate check
            { rows: [], rowCount: 1 }, // Insert
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await locationsV2.createLocationSecure({
            name: 'Nueva Sucursal',
            type: 'STORE'
        });

        expect(result.success).toBe(true);
        expect(result.data?.name).toBe('Nueva Sucursal');
    });

    it('should reject non-ADMIN creating location', async () => {
        const cashier = { ...mockAdmin, role: 'CASHIER' };
        createMockClient([
            { rows: [cashier], rowCount: 1 }
        ]);

        const result = await locationsV2.createLocationSecure({
            name: 'Nueva Sucursal',
            type: 'STORE'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('ADMIN');
    });

    it('should allow GERENTE_GENERAL to create location', async () => {
        const gerente = { ...mockAdmin, role: 'GERENTE_GENERAL' };
        createMockClient([
            { rows: [gerente], rowCount: 1 },
            { rows: [], rowCount: 0 },
            { rows: [], rowCount: 1 },
            { rows: [], rowCount: 0 }
        ]);

        const result = await locationsV2.createLocationSecure({
            name: 'Nueva Sucursal',
            type: 'STORE'
        });

        expect(result.success).toBe(true);
    });
});

// Deactivation tests - UUIDs corregidos
describe('Locations V2 - Deactivation', () => {
    it('should soft delete location', async () => {
        const mockClient = createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Auth
            { rows: [mockLocation], rowCount: 1 }, // Get location
            { rows: [{ count: '0' }], rowCount: 1 }, // No users
            { rows: [{ count: '0' }], rowCount: 1 }, // No children
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await locationsV2.deactivateLocationSecure(
            VALID_UUID_LOC_1,
            'Sucursal cerrada por remodelación'
        );

        expect(result.success).toBe(true);

        // Verify soft delete
        const updateCall = mockClient.query.mock.calls.find(
            (call) => (call[0] as string).includes('UPDATE locations') &&
                (call[0] as string).includes('is_active = false')
        );
        expect(updateCall).toBeDefined();

        // Verify NO hard delete
        const deleteCall = mockClient.query.mock.calls.find(
            (call) => (call[0] as string).includes('DELETE')
        );
        expect(deleteCall).toBeUndefined();
    });

    it('should prevent deactivation with assigned users', async () => {
        createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [mockLocation], rowCount: 1 },
            { rows: [{ count: '3' }], rowCount: 1 } // Has users
        ]);

        const result = await locationsV2.deactivateLocationSecure(
            VALID_UUID_LOC_1,
            'Closing location'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('usuarios');
    });

    it('should require minimum reason length', async () => {
        const result = await locationsV2.deactivateLocationSecure(
            VALID_UUID_LOC_1,
            'Short' // Too short
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('mínimo 10');
    });
});

// Stock Transfer tests - UUIDs corregidos
describe('Locations V2 - Stock Transfer', () => {
    it('should transfer stock with valid MANAGER PIN', async () => {
        createMockClient([
            { rows: [mockManager], rowCount: 1 }, // Auth
            {
                rows: [ // Both locations
                    { id: VALID_UUID_LOC_1, name: 'Origen', is_active: true },
                    { id: VALID_UUID_LOC_2, name: 'Destino', is_active: true }
                ], rowCount: 2
            },
            { rows: [{ id: VALID_UUID_BATCH_1, sku: 'SKU001', name: 'Product', quantity_real: 100, lot_number: 'LOT001' }], rowCount: 1 }, // Source batch
            { rows: [], rowCount: 1 }, // Update source
            { rows: [], rowCount: 0 }, // No existing target batch
            { rows: [], rowCount: 1 }, // Create target batch
            { rows: [], rowCount: 1 }, // Stock movements
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await locationsV2.transferStockBetweenLocationsSecure({
            sourceLocationId: VALID_UUID_LOC_1,
            targetLocationId: VALID_UUID_LOC_2,
            items: [{ sku: 'SKU001', quantity: 10 }],
            reason: 'Reabastecimiento',
            managerPin: '1234'
        });

        expect(result.success).toBe(true);
        expect(result.transferId).toBeDefined();
    });

    it('should reject insufficient stock', async () => {
        createMockClient([
            { rows: [mockManager], rowCount: 1 },
            {
                rows: [
                    { id: VALID_UUID_LOC_1, name: 'Origen', is_active: true },
                    { id: VALID_UUID_LOC_2, name: 'Destino', is_active: true }
                ], rowCount: 2
            },
            { rows: [], rowCount: 0 } // No batch with enough stock
        ]);

        const result = await locationsV2.transferStockBetweenLocationsSecure({
            sourceLocationId: VALID_UUID_LOC_1,
            targetLocationId: VALID_UUID_LOC_2,
            items: [{ sku: 'SKU001', quantity: 100 }],
            reason: 'Transfer',
            managerPin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Stock insuficiente');
    });

    it('should reject same source and target', async () => {
        const result = await locationsV2.transferStockBetweenLocationsSecure({
            sourceLocationId: VALID_UUID_LOC_1,
            targetLocationId: VALID_UUID_LOC_1, // Same
            items: [{ sku: 'SKU001', quantity: 10 }],
            reason: 'Transfer',
            managerPin: '1234'
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('diferentes');
    });

    it('should require MANAGER PIN', async () => {
        const result = await locationsV2.transferStockBetweenLocationsSecure({
            sourceLocationId: VALID_UUID_LOC_1,
            targetLocationId: VALID_UUID_LOC_2,
            items: [{ sku: 'SKU001', quantity: 10 }],
            reason: 'Transfer',
            managerPin: '' // Missing
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('PIN');
    });
});

// User Assignment tests - UUIDs corregidos
describe('Locations V2 - User Assignment', () => {
    it('should assign user to location (ADMIN only)', async () => {
        createMockClient([
            { rows: [mockAdmin], rowCount: 1 }, // Auth
            { rows: [mockLocation], rowCount: 1 }, // Location check
            { rows: [{ id: VALID_UUID_USER_1, name: 'User', assigned_location_id: null }], rowCount: 1 }, // User
            { rows: [], rowCount: 1 }, // Update
            { rows: [], rowCount: 0 } // Audit
        ]);

        const result = await locationsV2.assignUserToLocationSecure(
            VALID_UUID_USER_1,
            VALID_UUID_LOC_1,
            'Transferido a nueva sucursal'
        );

        expect(result.success).toBe(true);
    });

    it('should reject inactive location', async () => {
        createMockClient([
            { rows: [mockAdmin], rowCount: 1 },
            { rows: [], rowCount: 0 } // Location not found or inactive
        ]);

        const result = await locationsV2.assignUserToLocationSecure(
            VALID_UUID_USER_1,
            VALID_UUID_LOC_1,
            'Assignment'
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('inactiva');
    });
});

// Inventory Summary tests - UUIDs corregidos
describe('Locations V2 - Inventory Summary', () => {
    it('should return inventory summary', async () => {
        const mockDb = await import('@/lib/db');
        vi.mocked(mockDb.query).mockResolvedValueOnce({
            rows: [{
                total_skus: '45',
                total_units: '1250',
                total_value: '2500000',
                low_stock: '5',
                expiring_soon: '3'
            }],
            rowCount: 1,
            command: '',
            oid: 0,
            fields: []
        });

        const result = await locationsV2.getLocationInventorySummary(VALID_UUID_LOC_1);

        expect(result.success).toBe(true);
        expect(result.data?.totalSKUs).toBe(45);
        expect(result.data?.totalUnits).toBe(1250);
        expect(result.data?.lowStockItems).toBe(5);
    });

    it('should reject invalid location ID', async () => {
        const result = await locationsV2.getLocationInventorySummary('invalid-id');

        expect(result.success).toBe(false);
        expect(result.error).toContain('inválido');
    });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createMockClient(queryResults: Record<string, unknown>[] = []) {
    let callIndex = 0;

    const mockClient = {
        query: vi.fn((sql: string) => {
            const emptyResult = { rows: [], rowCount: 0, command: '', oid: 0, fields: [] };
            if (sql === 'BEGIN ISOLATION LEVEL SERIALIZABLE' || sql === 'COMMIT' || sql === 'ROLLBACK') {
                return Promise.resolve(emptyResult);
            }

            if (callIndex < queryResults.length) {
                return Promise.resolve({ ...emptyResult, ...queryResults[callIndex++] });
            }

            return Promise.resolve(emptyResult);
        }),
        release: vi.fn()
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(dbModule.pool.connect).mockResolvedValue(mockClient as any);

    return mockClient;
}
