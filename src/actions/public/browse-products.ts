'use server';

import { query } from '@/lib/db';
import { ProductResult, buildPublicProductResult } from './public-product-result';

export async function browseProductsAction(
    letter: string,
    page: number = 1,
    limit: number = 50
): Promise<ProductResult[]> {
    if (!letter && letter !== '') return [];

    const offset = (page - 1) * limit;
    const searchPattern = letter ? `${letter}%` : '%'; // If empty, list everything? Usually browsing implies a filter.

    try {
        console.log(`🔍 [Browse] Browsing for letter: "${letter}", Page: ${page}`);

        const sql = `
            WITH unified_inventory AS (
                -- 1. Master Products (priority 1 — always preferred)
                SELECT 
                    id::text,
                    name::text,
                    sku::text,
                    dci::text,
                    laboratory::text,
                    format::text,
                    isp_register::text,
                    price_sell_box as price,
                    stock_actual as stock,
                    units_per_box,
                    is_bioequivalent,
                    1 as priority
                FROM products p
                WHERE 
                    p.stock_actual > 0
                    AND TRIM(p.name) ILIKE $1

                UNION ALL

                -- 2. Legacy Batches (priority 2 — only whole items, only if no master product)
                SELECT 
                    id::text,
                    name::text,
                    sku::text,
                    NULL::text as dci,
                    NULL::text as laboratory,
                    NULL::text as format,
                    NULL::text as isp_register,
                    COALESCE(sale_price, 0) as price,
                    quantity_real as stock,
                    1 as units_per_box,
                    false as is_bioequivalent,
                    2 as priority
                FROM inventory_batches ib
                WHERE 
                    ib.quantity_real > 0
                    AND COALESCE(ib.is_retail_lot, false) = false
                    AND TRIM(ib.name) ILIKE $1
                    AND NOT EXISTS (
                        SELECT 1 FROM products p2
                        WHERE UPPER(TRIM(p2.name)) = UPPER(TRIM(ib.name))
                        AND p2.stock_actual > 0
                    )
            ),
            deduplicated AS (
                SELECT DISTINCT ON (UPPER(TRIM(name)))
                    id, name, sku, dci, laboratory, format, isp_register,
                    price, stock, units_per_box, is_bioequivalent, priority
                FROM unified_inventory
                ORDER BY UPPER(TRIM(name)), priority ASC
            )
            SELECT * FROM deduplicated
            ORDER BY name ASC
            LIMIT $2 OFFSET $3
        `;

        const result = await query(sql, [searchPattern, limit, offset]);

        console.log(`✅ [Browse] Found ${result.rows.length} products for letter ${letter}.`);

        // Debug first result for units
        if (result.rows.length > 0) {
            console.log(`🔍 [Browse Sample] ${result.rows[0].name} - Units: ${result.rows[0].units_per_box}`);
        }

        return result.rows.map((row) => buildPublicProductResult({
            id: row.id,
            name: row.name,
            sku: row.sku,
            is_bioequivalent: row.is_bioequivalent,
            stock: row.stock,
            laboratory: row.laboratory,
            dci: row.dci,
            format: row.format,
            isp_register: row.isp_register,
            units_per_box: row.units_per_box,
        }));

    } catch (error) {
        console.error('❌ Error in browseProductsAction:', error);
        return [];
    }
}
