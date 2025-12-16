'use server';

import { query } from '@/lib/db';

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
}

export async function getAlternativesAction(dci: string, currentId: string): Promise<AlternativeResult[]> {
    if (!dci || dci.trim().length === 0) return [];

    try {
        console.log(`🔍 Buscando alternativas para DCI: "${dci}" excluyendo ID: ${currentId}`);

        // Query:
        // 1. Same DCI (case insensitive)
        // 2. Exclude current product
        // 3. Join with inventory for stock/price
        // 4. Order by Price ASC (cheapest first)

        const sql = `
            SELECT 
                p.id, 
                p.name, 
                p.sku, 
                p.is_bioequivalent,
                p.laboratory,
                p.dci,
                p.format,
                COALESCE(SUM(ib.quantity_real), 0) as stock,
                COALESCE(MAX(ib.price_sell_box), MAX(p.price_sell_box), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text
            WHERE 
                p.dci ILIKE $1 
                AND p.id::text != $2
            GROUP BY p.id, p.name, p.sku, p.is_bioequivalent, p.price_sell_box, p.laboratory, p.dci, p.format
            ORDER BY price ASC
            LIMIT 10
        `;

        const result = await query(sql, [dci, currentId]);

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            sku: row.sku,
            is_bioequivalent: row.is_bioequivalent || false,
            stock: Number(row.stock),
            price: Number(row.price),
            laboratory: row.laboratory || '',
            dci: row.dci || '',
            format: row.format || ''
        }));

    } catch (error) {
        console.error('❌ Error getting alternatives:', error);
        return [];
    }
}
