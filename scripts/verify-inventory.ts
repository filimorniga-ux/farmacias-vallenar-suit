
import { pool } from '../src/lib/db';
import { approveInvoiceParsingSecure } from '../src/actions/invoice-parser-v2';
import { randomUUID } from 'crypto';

// Mock dependencies
jest.mock('next/headers', () => ({
    headers: () => new Map([
        ['x-user-id', 'test-user-id'],
        ['x-user-role', 'MANAGER']
    ])
}));

jest.mock('next/cache', () => ({
    revalidatePath: jest.fn()
}));

async function verifyInventoryIntegration() {
    const client = await pool.connect();

    try {
        console.log('🧪 Starting Inventory Integration Verification...');

        // 1. Create a Test Product
        const productId = randomUUID();
        const sku = `TEST-${Date.now()}`;
        console.log(`Creating test product: ${sku}`);

        await client.query(`
            INSERT INTO products (id, sku, name, price, cost_price, stock_actual, is_active)
            VALUES ($1, $2, 'Test Product', 1000, 500, 0, true)
        `, [productId, sku]);

        // 2. Create a Test Invoice Parsing
        const parsingId = randomUUID();
        const items = JSON.stringify([{
            description: 'Test Item',
            quantity: 10,
            unit_price: 500,
            total: 5000,
            mapped_product_id: productId
        }]);

        await client.query(`
            INSERT INTO invoice_parsings (
                id, status, file_url, original_file_name, 
                parsed_items, mapped_items, unmapped_items,
                uploaded_by, uploaded_at
            ) VALUES ($1, 'PENDING', 'http://test.com/file.pdf', 'test.pdf',
                $2, 1, 0,
                'test-user-id', NOW()
            )
        `, [parsingId, items]);

        console.log(`Created test parsing: ${parsingId}`);

        // 3. Execute Approval Action
        // We need to properly mock headers or use a localized version of the action if headers() fails in script
        // For this script, we'll manually invoke the core logic or use the action if environment allows

        console.log('Activating approval...');
        const result = await approveInvoiceParsingSecure(parsingId);

        if (!result.success) {
            throw new Error(`Approval failed: ${result.error}`);
        }

        console.log('Approval successful. Verifying inventory...');

        // 4. Verify Inventory Batch Creation
        const batchRes = await client.query(`
            SELECT * FROM inventory_batches WHERE product_id = $1
        `, [productId]);

        if (batchRes.rows.length === 0) {
            throw new Error('❌ Check Failed: No inventory batch created!');
        }

        const batch = batchRes.rows[0];
        console.log('✅ Inventory Batch Found:', {
            id: batch.id,
            quantity: batch.quantity_real,
            product_id: batch.product_id
        });

        if (batch.quantity_real !== 10) {
            throw new Error(`❌ Check Failed: Expected quantity 10, got ${batch.quantity_real}`);
        }

        // 5. Verify Stock Movement
        const moveRes = await client.query(`
            SELECT * FROM stock_movements WHERE batch_id = $1
        `, [batch.id]);

        if (moveRes.rows.length === 0) {
            throw new Error('❌ Check Failed: No stock movement recorded!');
        }

        console.log('✅ Stock Movement Verified');
        console.log('🎉 Integration Test Passed!');

    } catch (error) {
        console.error('❌ Test Failed:', error);
    } finally {
        await client.query('ROLLBACK'); // Always clean up
        client.release();
        await pool.end();
    }
}

verifyInventoryIntegration();
