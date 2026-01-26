'use server';

import { query } from '@/lib/db';
import { parseProductDetails } from '@/lib/product-parser';

export interface ProductResult {
    id: string;
    name: string;
    sku: string;
    is_bioequivalent: boolean;
    stock: number;
    price: number;
    location_name?: string;
    description?: string;
    format?: string;
    laboratory?: string;
    dci?: string;
    units_per_box?: number;
    isp_register?: string;
}

// Enhanced Search with Optimized Performance (Push-down Predicates)
export async function searchProductsAction(
    term: string,
    filters?: { categoryId?: number, labId?: number, actionId?: number }
) {
    if ((!term || term.length < 3) && (!filters || Object.keys(filters).length === 0)) return [];

    try {
        const searchTerm = term ? `%${term.trim()}%` : null;
        let params: any[] = [];
        let paramCounter = 1;

        // Helper to build WHERE clause for each subquery
        const buildWhere = (prefix: string) => {
            const conditions: string[] = [];
            // Basic validity
            if (prefix === 'ib') conditions.push(`${prefix}.quantity_real > 0`);
            if (prefix === 'p') conditions.push(`${prefix}.stock_actual > 0`);

            if (searchTerm) {
                // Determine columns based on table alias
                const nameCol = prefix === 'ib' ? 'name' : 'name'; // same
                const skuCol = prefix === 'ib' ? 'sku' : 'sku';   // same
                const dciCol = prefix === 'ib' ? 'NULL' : 'dci';  // batches have no DCI column

                if (prefix === 'p') {
                    conditions.push(`(${nameCol} ILIKE $${paramCounter} OR ${skuCol} ILIKE $${paramCounter} OR ${dciCol} ILIKE $${paramCounter})`);
                } else {
                    // Legacy batches don't have DCI column, only Name/SKU
                    conditions.push(`(${nameCol} ILIKE $${paramCounter} OR ${skuCol} ILIKE $${paramCounter})`);
                }
            }
            return conditions.length ? 'AND ' + conditions.join(' AND ') : '';
        };

        // Prepare param
        if (searchTerm) params.push(searchTerm);

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
                WHERE p.stock_actual > 0
                ${searchTerm ? `AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR p.dci ILIKE $1)` : ''}
                
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
                WHERE ib.quantity_real > 0
                ${searchTerm ? `AND (ib.name ILIKE $1 OR ib.sku ILIKE $1)` : ''}
            )
            SELECT 
                id,
                name,
                sku,
                dci,
                laboratory,
                format,
                isp_register,
                price,
                stock,
                units_per_box,
                is_bioequivalent
            FROM unified_inventory
            ORDER BY 
                priority ASC, -- Pivot master products first
                name ASC
            LIMIT 50
        `;

        const result = await query(sql, params);

        console.log(`✅ [Search AI] Optimizado: ${result.rows.length} encontrados.`);

        return result.rows.map(row => {
            const details = parseProductDetails(
                row.name,
                row.units_per_box,
                row.dci,
                row.laboratory,
                row.format
            );
            return {
                id: row.id,
                name: row.name,
                sku: row.sku || 'S/SKU',
                is_bioequivalent: row.is_bioequivalent || false,
                stock: Number(row.stock),
                price: Number(row.price),
                laboratory: details.lab || 'Generico',
                category: 'Farmacia',
                action: '',
                dci: details.dci || '',
                units_per_box: details.units,
                format: details.format || '',
                isp_register: row.isp_register || '',
                location_name: ''
            };
        });

    } catch (error: any) {
        console.error('❌ Error in search:', error);
        // Re-throw the error so the UI handles it as a failure, not "0 results"
        throw new Error(`Database Error: ${error.message || 'Unknown error'}`);
    }
}
