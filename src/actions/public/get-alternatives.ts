'use server';

import { query } from '@/lib/db';
import { parseProductDetails } from '@/lib/product-parser';

export interface AlternativeResult {
    id: string;
    name: string;
    sku: string;
    is_bioequivalent: boolean;
    stock: number;
    price: number;
    laboratory?: string;
    dci?: string;
    format?: string;
    units_per_box?: number;
    isp_register?: string;
}

export async function getAlternativesAction(dci: string, currentId: string): Promise<AlternativeResult[]> {
    if (!dci || dci.trim().length === 0) return [];

    try {
        console.log(`🔍 [Alternatives] Buscando DCI: "${dci}" excluyendo ID: ${currentId}`);

        // Strategy 1: Exact DCI Match on Products (High Priority)
        // Extract words > 3 chars
        const cleanTerm = dci.replace(/[^\w\s]/gi, '').trim();
        const words = cleanTerm.split(/\s+/).filter(w => w.length > 3);

        if (words.length === 0) return []; // Too risky to search for "de" or "la"

        // Build dynamic OR conditions
        let paramCounter = 2; // $1 is currentId
        const params = [currentId];
        const conditions: string[] = [];

        words.forEach(w => {
            conditions.push(`name ILIKE $${paramCounter}`); // Use generic 'name' placeholder for now, will replace later
            params.push(`%${w}%`);
            paramCounter++;
        });

        // Use OR (broad match) as requested ("asi sea una sola palabra")
        const orClause = conditions.join(' OR ');

        // Query both tables
        const sql = `
            WITH candidates AS (
                -- 1. Master Products
                SELECT 
                    p.id::text,
                    p.name::text,
                    p.sku::text,
                    p.dci::text,
                    p.laboratory::text,
                    p.format::text,
                    p.isp_register::text,
                    p.units_per_box,
                    p.is_bioequivalent,
                    p.stock_actual as stock,
                    p.price_sell_box as price,
                    1 as source_prio
                FROM products p
                WHERE 
                    p.id::text != $1
                    AND p.stock_actual > 0
                    AND (${orClause.replace(/name/g, 'p.name')} OR ${orClause.replace(/name/g, 'p.dci')})
                
                UNION ALL

                -- 2. Inventory Batches
                SELECT 
                    ib.id::text,
                    ib.name::text,
                    ib.sku::text,
                    NULL::text,
                    NULL::text,
                    NULL::text,
                    NULL::text,
                    1,
                    false,
                    ib.quantity_real as stock,
                    COALESCE(ib.sale_price, 0) as price,
                    2 as source_prio
                FROM inventory_batches ib
                WHERE 
                    ib.id::text != $1
                    AND ib.quantity_real > 0
                    AND (${orClause.replace(/name/g, 'ib.name')})
            )
            SELECT DISTINCT ON (name) * FROM candidates
            WHERE price > 50
            ORDER BY 
                name ASC, 
                price ASC
            LIMIT 20
        `;

        const result = await query(sql, params);

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
                sku: row.sku || '',
                is_bioequivalent: row.is_bioequivalent || false,
                stock: Number(row.stock),
                price: Number(row.price),
                laboratory: details.lab || 'Generico',
                dci: details.dci || '',
                format: details.format || '',
                units_per_box: details.units,
                isp_register: row.isp_register || ''
            };
        });

    } catch (error) {
        console.error('❌ Error getting alternatives:', error);
        return [];
    }
}
