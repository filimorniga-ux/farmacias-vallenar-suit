'use server';

import { query } from '@/lib/db';
import { ProductResult } from './search-products';
import { parseProductDetails } from '@/lib/product-parser';

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
                -- 1. Master Products
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
                    1 as priority -- Prefer Master Products
                FROM products p
                WHERE 
                    p.stock_actual > 0
                    AND TRIM(p.name) ILIKE $1
                
                UNION ALL
                
                -- 2. Legacy Batches
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
                    2 as priority -- Lower priority
                FROM inventory_batches ib
                WHERE 
                    ib.quantity_real > 0
                    AND TRIM(ib.name) ILIKE $1
            )
            SELECT 
                *
            FROM unified_inventory
            ORDER BY 
                name ASC
            LIMIT $2 OFFSET $3
        `;

        const result = await query(sql, [searchPattern, limit, offset]);

        console.log(`✅ [Browse] Found ${result.rows.length} products for letter ${letter}.`);

        // Debug first result for units
        if (result.rows.length > 0) {
            console.log(`🔍 [Browse Sample] ${result.rows[0].name} - Units: ${result.rows[0].units_per_box}`);
        }

        return result.rows.map(row => {
            // Enrich data using parser (especially for legacy batches)
            const details = parseProductDetails(
                row.name,
                row.units_per_box,
                row.dci,
                row.laboratory,
                row.format
            );

            // Log details for debugging just once
            if (result.rows.indexOf(row) === 0) {
                console.log(`🔍 [Parser] Parsed: ${row.name} -> Units: ${details.units}, DCI: ${details.dci}`);
            }

            return {
                id: row.id,
                name: row.name,
                sku: row.sku || 'S/SKU',
                is_bioequivalent: row.is_bioequivalent || false,
                stock: Number(row.stock),
                price: Number(row.price),
                laboratory: details.lab || 'Generico', // Parsed or Original
                category: 'Farmacia',
                action: '',
                dci: details.dci || '',     // Parsed or Original
                units_per_box: details.units, // Parsed or Original (Fixes Unit Price!)
                format: details.format || '', // Parsed or Original
                isp_register: row.isp_register || '',
                location_name: ''
            };
        });

    } catch (error) {
        console.error('❌ Error in browseProductsAction:', error);
        return [];
    }
}
