import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { InventoryBatch } from '@/domain/types';

export async function POST(request: Request) {
    const client = await pool.connect();

    try {
        const body = await request.json();
        const { products } = body as { products: InventoryBatch[] };

        if (!products || !Array.isArray(products) || products.length === 0) {
            return NextResponse.json({ error: 'No products provided' }, { status: 400 });
        }

        console.log(`📦 [API v4 DEBUG] Starting bulk import of ${products.length} items...`);

        // DEBUG: Check actual columns in the DB the app is connected to
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'products'
        `);
        console.log('🔍 [DEBUG] Actual columns in "products" table:', columnCheck.rows.map(r => r.column_name).join(', '));

        // DEBUG: Check DB Host (masked)
        const dbHost = process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] || 'UNKNOWN';
        console.log('🌍 [DEBUG] Connected to DB Host:', dbHost);

        // Start Transaction
        await client.query('BEGIN');

        // Prepare bulk insert query for products
        // We use ON CONFLICT to update existing records
        const queryText = `
            INSERT INTO products (
                id, sku, name, dci, laboratory, 
                stock_total, price_sell_box, cost_net, 
                format, is_bioequivalent, category
            )
            VALUES (
                $1, $2, $3, $4, $5, 
                $6, $7, $8, 
                $9, $10, $11
            )
            ON CONFLICT (sku) DO UPDATE SET
                name = EXCLUDED.name,
                dci = EXCLUDED.dci,
                laboratory = EXCLUDED.laboratory,
                stock_total = products.stock_total + EXCLUDED.stock_total, -- Merge stock
                price_sell_box = EXCLUDED.price_sell_box,
                cost_net = EXCLUDED.cost_net,
                updated_at = NOW()
            RETURNING id;
        `;

        // Execute inserts sequentially within transaction
        // For massive datasets, we could use pg-copy-streams, but for ~4000 items, 
        // a loop with prepared statements is acceptable and safer for conflict handling.
        for (const product of products) {
            // Map cost_net (new standard) to cost_price (legacy DB column)
            const cost = product.cost_net || product.cost_price || 0;
            const price = product.price_sell_box || product.price || 0;

            await client.query(queryText, [
                product.id,
                product.sku,
                product.name,
                product.dci || '',
                product.laboratory || 'GENERICO',
                product.stock_actual || 0,
                price,
                cost,
                product.format || 'UNIDAD',
                product.is_bioequivalent || false,
                product.category || 'MEDICAMENTO'
            ]);
        }

        // Commit Transaction
        await client.query('COMMIT');
        console.log(`✅ [API] Bulk import committed successfully.`);

        return NextResponse.json({ success: true, count: products.length });

    } catch (error) {
        // Rollback Transaction on Error
        await client.query('ROLLBACK');
        console.error('❌ [API] Bulk import failed:', error);
        return NextResponse.json(
            {
                error: 'Failed to import batch',
                details: (error as Error).message,
                code: (error as any).code, // PostgreSQL error code
                debug: {
                    host: process.env.DATABASE_URL?.split('@')[1]?.split(':')[0] || 'UNKNOWN',
                    columns: (await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'products'")).rows.map(r => r.column_name)
                }
            },
            { status: 500 }
        );
    } finally {
        // Release client back to pool
        client.release();
    }
}
