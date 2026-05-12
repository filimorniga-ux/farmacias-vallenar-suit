'use server';

import { query } from '@/lib/db';
import { logger } from '@/lib/logger';
import { buildPublicProductResult } from './public-product-result';
import {
    enforcePublicSearchGuard,
    normalizePublicSearchTerm,
} from './public-search-guard';

// Enhanced Search with Optimized Performance (Push-down Predicates)
export async function searchProductsAction(
    term: string,
    filters?: { categoryId?: number, labId?: number, actionId?: number }
) {
    if (!await enforcePublicSearchGuard('product-search')) return [];

    const normalizedTerm = normalizePublicSearchTerm(term);
    if ((!normalizedTerm || normalizedTerm.length < 3) && (!filters || Object.keys(filters).length === 0)) return [];

    try {
        const searchTerm = normalizedTerm ? `%${normalizedTerm}%` : null;
        const params: any[] = [];
        const paramCounter = 1;

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
                WHERE p.stock_actual > 0
                ${searchTerm ? `AND (p.name ILIKE $1 OR p.sku ILIKE $1 OR p.dci ILIKE $1)` : ''}

                UNION ALL

                -- 2. Legacy Batches (priority 2 — only whole items, only if no master product exists)
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
                WHERE ib.quantity_real > 0
                AND COALESCE(ib.is_retail_lot, false) = false
                ${searchTerm ? `AND (ib.name ILIKE $1 OR ib.sku ILIKE $1)` : ''}
                AND NOT EXISTS (
                    SELECT 1 FROM products p2
                    WHERE UPPER(TRIM(p2.name)) = UPPER(TRIM(ib.name))
                    AND p2.stock_actual > 0
                )
            ),
            deduplicated AS (
                SELECT DISTINCT ON (UPPER(TRIM(name)))
                    id, name, sku, dci, laboratory, format, isp_register,
                    price, stock, units_per_box, is_bioequivalent
                FROM unified_inventory
                ORDER BY UPPER(TRIM(name)), priority ASC
            )
            SELECT * FROM deduplicated
            ORDER BY name ASC
            LIMIT 50
        `;

        const result = await query(sql, params);

        logger.info({ count: result.rows.length }, '[PublicSearch] Product search completed');

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

    } catch (error: any) {
        logger.error({ error }, '[PublicSearch] Product search failed');
        // Re-throw the error so the UI handles it as a failure, not "0 results"
        throw new Error('No fue posible buscar productos');
    }
}
