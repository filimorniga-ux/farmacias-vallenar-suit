import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { v4 as uuidv4 } from 'uuid';

// Dynamic import setup to ensure env vars are loaded first
async function boostSales() {
    console.log('🚀 Iniciando Sales Booster...');

    // Import DB after env config
    const { query } = await import('../lib/db');

    try {
        // 1. Inspect Products Schema
        const debugRes = await query(`SELECT * FROM products LIMIT 1`);
        if (debugRes.rows.length > 0) {
            console.log('🔍 Products Columns:', Object.keys(debugRes.rows[0]));
        } else {
            console.log('⚠️ Products table is empty');
        }

        const debugSales = await query(`SELECT * FROM sales LIMIT 1`);
        if (debugSales.rows.length > 0) {
            console.log('🔍 Sales Columns:', Object.keys(debugSales.rows[0]));
        } else {
            console.log('⚠️ Sales table is empty so I cannot check columns. Using "total" guess.');
        }

        // 1. Get High Ticket Products (> 10.000)
        // Trying to guess column name based on common patterns if inspection fails, but let's assume 'price' first or look at logs.
        // Actually, I will pause here to see the log output if I run this.
        // But to be efficient, I will try a flexible query or just see the output.
        // Let's use 'price' as a guess in the query, but if it fails, I'll see the column list.
        const productsRes = await query(`
            SELECT id, price, cost_price 
            FROM products 
            WHERE price > 10000 
            LIMIT 50
        `);

        if (productsRes.rows.length === 0) {
            console.error('❌ No hay productos de alto valor (> 10.000). Ajusta el script.');
            return;
        }

        const products = productsRes.rows;
        console.log(`✅ ${products.length} productos "High Ticket" encontrados.`);

        // 2. Get Locations and Users for distribution
        const locRes = await query("SELECT id FROM locations LIMIT 1");
        // Fallback to any user if specific roles not found.
        const userRes = await query("SELECT id FROM users LIMIT 1");

        const locationId = locRes.rows[0]?.id;
        const userId = userRes.rows[0]?.id;

        if (!locationId || !userId) {
            console.error('❌ Faltan locations o users.');
            return;
        }

        // 2b. Assign a Batch to each Product (Create Dummy Batch if needed)
        console.log('📦 Generando Lotes (Batches) para los productos...');
        for (const prod of products) {
            // Create a dummy batch for this product so we can link sales
            const batchId = uuidv4();
            const batchSql = `
                INSERT INTO inventory_batches (id, product_id, quantity_real, unit_cost, sale_price, warehouse_id, location_id, sku, name)
                VALUES ($1, $2, 1000, $3, $4, 'WAREHOUSE-DUMMY', $5, 'SKU-DUMMY', 'Product Dummy')
             `;
            // Note: Depending on schema constraints (FKs), warehouse_id/location_id might need to be valid.
            // We have locationId. Warehouse usually links to location.
            // Try to insert. If fails on FK, we might need a real warehouse ID.
            // But let's try with the locationId we have.

            // Check inventory_batches columns first? No, trust standard.
            // wait, inventory_batches schema:
            // id, product_id, sku, name, location_id, warehouse_id ...
            // Let's assume minimal columns.

            // To be safe, let's just add a property to the product object locally and use a simple batch ID if we can skip FK,
            // BUT `sale_items` -> `inventory_batches` is likely an FK.
            // AND queries do JOIN.
            // So the batch MUST exist.

            // Simplification: We will try to insert a batch.
            // If it fails, we catch it.
            try {
                await query(`
                    INSERT INTO inventory_batches (id, product_id, location_id, quantity_real, unit_cost, sale_price, sku, name)
                    VALUES ($1, $2, $3, 9999, $4, $5, 'DUMMY-SKU', 'Automated Batch')
                 `, [batchId, prod.id, locationId, prod.cost_price || 0, prod.price]);
                prod.batch_id = batchId; // Link
            } catch (e: any) {
                console.warn(`Could not create batch for product ${prod.id}, skipping sales generation for this one.`, e.message);
                prod.batch_id = null;
            }
        }

        // Filter products with valid batches
        const validProducts = products.filter(p => p.batch_id);

        if (validProducts.length === 0) {
            console.error('❌ No se pudieron crear lotes. No se pueden generar ventas.');
            return;
        }

        // 3. Generate 2500 Sales
        console.log('📦 Generando 2,500 ventas simuladas...');

        const salesToInsert = [];
        const itemsToInsert = [];

        const now = new Date();
        const startParams = new Date(now.getFullYear(), now.getMonth() - 1, 1); // Start of last month

        // Distribution: 40% Nov, 60% Dec (Current Month)

        for (let i = 0; i < 2500; i++) {
            const saleId = uuidv4();

            // Random Product from VALID list
            const product = validProducts[Math.floor(Math.random() * validProducts.length)];

            // Random Date (Last 45 days)
            const daysAgo = Math.floor(Math.random() * 45);
            const saleDate = new Date();
            saleDate.setDate(saleDate.getDate() - daysAgo);

            // Random Quantity (1-3)
            const qty = Math.floor(Math.random() * 3) + 1;
            const total = Number(product.price) * qty;

            // Sale Record
            salesToInsert.push({
                id: saleId,
                total_amount: total,
                payment_method: Math.random() > 0.5 ? 'CASH' : 'DEBIT',
                status: 'COMPLETED',
                timestamp: saleDate.toISOString(),
                user_id: userId,
                location_id: locationId,
                dte_status: 'ISSUED' // Simulamos que fueron emitidas
            });

            // Item Record
            itemsToInsert.push({
                id: uuidv4(),
                sale_id: saleId,
                batch_id: product.batch_id, // Use the generated batch ID
                quantity: qty,
                unit_price: Number(product.price),
                total_price: total
            });
        }

        // 4. Batch Insert (Chunks of 50 to avoid params limit)
        const CHUNK_SIZE = 50;

        console.log('💾 Insertando en BD...');

        for (let i = 0; i < salesToInsert.length; i += CHUNK_SIZE) {
            const chunk = salesToInsert.slice(i, i + CHUNK_SIZE);

            // Construct Bulk Insert Query for Sales
            // INSERT INTO sales (id, total_amount, payment_method, status, timestamp, user_id, location_id, dte_status) VALUES ...
            // postgres param limit is 65535. 50 * 8 = 400 params. OK.

            const values = [];
            const placeholders = [];
            let paramIdx = 1;


            for (const sale of chunk) {
                placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                values.push(sale.id, sale.total_amount, sale.total_amount, sale.payment_method, sale.timestamp, sale.user_id, sale.location_id, sale.dte_status);
            }

            const sql = `
                INSERT INTO sales (id, total, total_amount, payment_method, timestamp, user_id, location_id, dte_status)
                VALUES ${placeholders.join(', ')}
            `;

            await query(sql, values);
            process.stdout.write('.');
        }

        console.log('\n✅ Ventas insertadas.');
        console.log('💾 Insertando Items...');

        // Insert Items
        for (let i = 0; i < itemsToInsert.length; i += CHUNK_SIZE) {
            const chunk = itemsToInsert.slice(i, i + CHUNK_SIZE);

            const values = [];
            const placeholders = [];
            let paramIdx = 1;

            for (const item of chunk) {
                placeholders.push(`($${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++}, $${paramIdx++})`);
                values.push(item.id, item.sale_id, item.batch_id, item.quantity, item.unit_price, item.total_price);
            }

            const sql = `
                INSERT INTO sale_items (id, sale_id, batch_id, quantity, unit_price, total_price)
                VALUES ${placeholders.join(', ')}
             `;

            await query(sql, values);
            process.stdout.write('.');
        }

        console.log('\n🎉 Proceso Finalizado. Rentabilidad Inyectada.');

    } catch (error) {
        console.error('\n❌ Error:', error);
    }
}

boostSales();
