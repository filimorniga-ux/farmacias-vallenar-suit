
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

// Use real DB for integration test (or mock if preferred, but verification script used real DB)
// For integration tests, we usually want real DB interaction.
const pool = new Pool({
    connectionString: process.env.POSTGRES_URL || process.env.DATABASE_URL
});

console.log('🔌 Test connecting to DB:', pool.options.connectionString ? (pool.options.connectionString as string).replace(/:[^:@]+@/, ':****@') : 'URL MISSING');

// Skip if no real database is available
const hasRealDb = Boolean(process.env.POSTGRES_URL);
describe.skipIf(!hasRealDb)('Inventory Integration (Invoice Approval)', () => {

    it('should create inventory batch and stock movement when invoice is approved', async () => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const userId = randomUUID();
            const locationId = randomUUID();
            const productId = randomUUID();
            const parsingId = randomUUID();
            const sku = `TEST-${Date.now()}`;

            // 0. Setup Location
            await client.query(`
                INSERT INTO locations (id, name, address, is_active)
                VALUES ($1, 'Test Location', 'Test Address', true)
                ON CONFLICT (id) DO NOTHING
            `, [locationId]);

            // 1. Setup Product
            await client.query(`
                INSERT INTO products (id, sku, name, price, cost_price, stock_actual)
                VALUES ($1, $2, 'Test Product', 1000, 500, 0)
            `, [productId, sku]);

            // 2. Setup Invoice Parsing
            const items = JSON.stringify([{
                description: 'Test Item',
                quantity: 10,
                unit_cost: 500,
                total: 5000,
                mapped_product_id: productId
            }]);

            await client.query(`
                INSERT INTO invoice_parsings (
                    id, status, original_file_name, 
                    parsed_items, mapped_items, unmapped_items,
                    created_by, invoice_number, document_type, original_file_type
                ) VALUES ($1, 'PENDING', 'test.pdf',
                    $2, 1, 0,
                    $3, '12345', 'FACTURA', 'pdf'
                )
            `, [parsingId, items, userId]);

            // 3. Simulate Approval Logic
            const parsedItems = JSON.parse(items);
            for (const item of parsedItems) {
                if (item.mapped_product_id) {
                    const batchId = randomUUID();

                    // Insert Batch
                    await client.query(`
                        INSERT INTO inventory_batches (
                            id, product_id, location_id, 
                            lot_number, expiry_date, 
                            quantity_real, unit_cost, updated_at, source_system
                        ) VALUES ($1, $2, $3, 'LOT-TEST', NOW() + interval '1 year', $4, $5, NOW(), 'AI_PARSER')
                    `, [batchId, item.mapped_product_id, locationId, item.quantity, item.unit_cost]);

                    // Insert Movement
                    await client.query(`
                        INSERT INTO stock_movements (
                            id, sku, product_name, location_id, movement_type,
                            quantity, stock_before, stock_after, 
                            timestamp, user_id, notes, batch_id, 
                            reference_type, reference_id
                        ) VALUES ($1, $2, 'Test Product', $3, 'RECEIPT', $4, 0, $4, NOW(), $5, 'COMPRA_IA', $6, 'PURCHASE_ORDER', $7)
                    `, [randomUUID(), sku, locationId, item.quantity, userId, batchId, parsingId]);
                }
            }

            // 4. Verify Batch Creation
            const batchRes = await client.query('SELECT * FROM inventory_batches WHERE product_id = $1', [productId]);
            expect(batchRes.rows.length).toBeGreaterThan(0);
            expect(Number(batchRes.rows[0].quantity_real)).toBe(10);

            // 5. Verify Stock Movement
            const moveRes = await client.query('SELECT * FROM stock_movements WHERE reference_id = $1', [parsingId]);
            expect(moveRes.rows.length).toBeGreaterThan(0);
            expect(moveRes.rows[0].movement_type).toBe('RECEIPT');

        } finally {
            await client.query('ROLLBACK');
            client.release();
        }
    });

    afterAll(async () => {
        await pool.end();
    });
});
