'use server';

import { query } from '@/lib/db';

export interface RestockSuggestion {
    product_id: string;
    product_name: string;
    sku: string;
    image_url?: string;
    current_stock: number;
    daily_velocity: number;
    suggested_quantity: number;
    unit_cost: number;
    total_estimated: number;
    supplier_sku?: string;
}

/**
 * 🧠 The Brain: MRP Algorithm
 * Calculates how much to buy based on past velocity and desired coverage.
 */
export async function generateRestockSuggestion(
    supplierId: string,
    daysToCover: number = 15,
    analysisWindow: number = 30
): Promise<{ success: boolean; data?: RestockSuggestion[]; error?: string }> {
    try {
        // SQL Explanation:
        // 1. Filter products linked to this Supplier (ps).
        // 2. LEFT JOIN stock (ib) to sum current inventory.
        // 3. LEFT JOIN sales (sales + sale_items) filtered by date window to sum total sold.
        // 4. Calculate Velocity = TotalSold / Window.
        // 5. Calculate Required = Velocity * Coverage.
        // 6. Calculate Suggestion = Required - Stock.

        // Note: We use COALESCE to handle nulls (0 stock or 0 sales).

        const sql = `
            WITH 
            -- 1. Product & Supplier Link
            TargetProducts AS (
                SELECT 
                    p.id as product_id, 
                    p.name as product_name, 
                    p.sku as product_sku, 
                    p.image_url,
                    ps.last_cost, 
                    ps.supplier_sku
                FROM products p
                JOIN product_suppliers ps ON p.id = ps.product_id
                WHERE ps.supplier_id = $1
            ),
            
            -- 2. Current Stock (Sum of all batches for these products)
            CurrentStock AS (
                SELECT 
                    product_id, 
                    SUM(quantity_real) as total_stock
                FROM inventory_batches
                GROUP BY product_id
            ),
            
            -- 3. Sales History (Sum of quantity sold in window)
            SalesHistory AS (
                SELECT 
                    si.product_id, 
                    SUM(si.quantity) as total_sold
                FROM sale_items si
                JOIN sales s ON si.sale_id = s.id
                WHERE s.created_at >= NOW() - ($2 || ' days')::INTERVAL
                GROUP BY si.product_id
            )

            SELECT 
                tp.product_id,
                tp.product_name,
                tp.product_sku as sku,
                tp.image_url,
                tp.last_cost as unit_cost,
                tp.supplier_sku,
                COALESCE(cs.total_stock, 0) as current_stock,
                COALESCE(sh.total_sold, 0) as total_sold_in_window,
                
                -- Calculations
                -- Velocity: Sold / Window
                (COALESCE(sh.total_sold, 0)::FLOAT / $2::FLOAT) as daily_velocity,
                
                -- Suggested: (Velocity * Coverage) - CurrentStock
                GREATEST(
                    0, 
                    ROUND(
                        ((COALESCE(sh.total_sold, 0)::FLOAT / $2::FLOAT) * $3::FLOAT) - COALESCE(cs.total_stock, 0)
                    )
                ) as suggested_quantity

            FROM TargetProducts tp
            LEFT JOIN CurrentStock cs ON tp.product_id = cs.product_id
            LEFT JOIN SalesHistory sh ON tp.product_id = sh.product_id
            
            ORDER BY tp.product_name ASC
        `;

        // Params: $1=Supplier, $2=AnalysisWindow (used for WHERE and Divisor), $3=DaysToCover
        // Wait, AnalysisWindow is $2. DailyVelocity = TotalSold / AnalysisWindow.
        // The SQL above uses $2 for both interval and division. Correct.

        const res = await query(sql, [supplierId, analysisWindow, daysToCover]);

        const suggestions: RestockSuggestion[] = res.rows.map(row => ({
            product_id: row.product_id,
            product_name: row.product_name,
            sku: row.sku,
            image_url: row.image_url,
            current_stock: Number(row.current_stock),
            daily_velocity: Number(Number(row.daily_velocity).toFixed(2)), // Clean float
            suggested_quantity: Number(row.suggested_quantity),
            unit_cost: Number(row.unit_cost),
            supplier_sku: row.supplier_sku,
            total_estimated: Number(row.suggested_quantity) * Number(row.unit_cost)
        }));

        // Debug Log (for verification as requested)
        if (suggestions.length > 0) {
            console.log(`[MRP] Generated ${suggestions.length} suggestions for Supplier ${supplierId}`);
            console.log(`[MRP] Sample: ${suggestions[0].product_name} - Velocity: ${suggestions[0].daily_velocity}/day -> Suggest: ${suggestions[0].suggested_quantity}`);
        } else {
            console.log(`[MRP] No suggestions found. Check if products are linked to Supplier ${supplierId}.`);
        }

        return { success: true, data: suggestions };

    } catch (error: any) {
        console.error('Error generating MRP:', error);
        return { success: false, error: 'Failed to generate suggestions' };
    }
}

export async function createPurchaseOrderFromSuggestion(
    supplierId: string,
    items: { product_id: string; product_name: string; quantity: number; cost: number }[],
    warehouseId?: string
) {
    const client = await import('@/lib/db').then(mod => mod.pool.connect()); // Import pool dynamically or reuse query if possible, but transaction needed.
    // Reusing direct client for transaction safety

    try {
        await client.query('BEGIN');

        // 1. Validate Supplier
        const supRes = await client.query('SELECT name FROM suppliers WHERE id = $1', [supplierId]);
        if ((supRes.rowCount ?? 0) === 0) throw new Error('Supplier not found');

        // 2. Resolve Target Warehouse
        // If not provided, use default? For now require it or assume Main.
        // Let's defaulted to the first available Warehouse for simplicity of Phase 3 UI if not passed.
        // Ideally UI selector.
        let targetWh = warehouseId;
        if (!targetWh) {
            const whRes = await client.query('SELECT id FROM warehouses LIMIT 1');
            if ((whRes.rowCount ?? 0) > 0) targetWh = whRes.rows[0].id;
            else throw new Error('No warehouse available to receive');
        }

        // 3. Create PO Header
        const poRes = await client.query(`
            INSERT INTO purchase_orders (
                supplier_id, target_warehouse_id, 
                created_at, status, is_auto_generated, generation_reason, total_estimated
            ) VALUES ($1, $2, NOW(), 'DRAFT', true, 'Smart Order Algorithm', 0)
            RETURNING id
        `, [supplierId, targetWh]);

        const poId = poRes.rows[0].id;
        let total = 0;

        // 4. Insert Items
        for (const item of items) {
            if (item.quantity <= 0) continue; // Skip zeros

            // Need SKU? We only have Product ID in suggestion.
            // We should fetch SKU from Product table to be safe or pass it from UI.
            // The UI has it. Let's assume UI passes it or we fetch.
            // Efficiency: Fetch all at once? 
            // Let's assume `items` includes SKU or we allow NULL if standard allows.
            // But existing `purchase_order_items` Schema uses SKU?
            // Checking `supply.ts` insert... it uses SKU. 
            // So I MUST pass SKU from UI or fetch it here.
            // Update the Function Signature to include SKU.

            // Quick fix: Fetch SKU if missing.
            const prodRes = await client.query('SELECT sku FROM products WHERE id = $1', [item.product_id]);
            const sku = prodRes.rows[0]?.sku || 'UNKNOWN';

            await client.query(`
                INSERT INTO purchase_order_items (
                    purchase_order_id, sku, name, quantity_ordered, cost_price, suggested_quantity
                ) VALUES ($1, $2, $3, $4, $5, $4) 
             `, [poId, sku, item.product_name, item.quantity, item.cost]);

            total += (item.quantity * item.cost);
        }

        // 5. Update Total
        await client.query('UPDATE purchase_orders SET total_estimated = $1 WHERE id = $2', [total, poId]);

        await client.query('COMMIT');
        return { success: true, orderId: poId };

    } catch (error: any) {
        await client.query('ROLLBACK');
        console.error('Error creating Smart PO:', error);
        return { success: false, error: 'Failed to create order' };
    } finally {
        client.release();
    }
}
