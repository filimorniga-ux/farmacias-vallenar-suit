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
    units_per_box?: number;
}

export async function getAlternativesAction(dci: string, currentId: string): Promise<AlternativeResult[]> {
    if (!dci || dci.trim().length === 0) return [];

    try {
        console.log(`🔍 [Alternatives] Buscando DCI: "${dci}" excluyendo ID: ${currentId}`);

        // Query Products Table (Real Inventory)
        const sql = `
            SELECT 
                p.id::text as id,
                p.name::text,
                p.sku::text,
                p.dci::text,
                p.laboratory::text,
                p.format::text,
                p.units_per_box,
                p.is_bioequivalent,
                p.stock_actual as stock,
                p.price_sell_box as price
            FROM products p
            WHERE 
                p.dci ILIKE $1 
                AND p.id::text != $2
                AND p.stock_actual > 0
            ORDER BY price ASC
            LIMIT 10
        `;

        let result = await query(sql, [dci, currentId]);

        // Fallback: If no results found by DCI (or DCI was empty), try finding by Name similarity
        if (result.rows.length === 0) {
            // Extract first 2 significant words from the product name we are looking at? 
            // Ideally we would need the original product name here. 
            // But since we only have DCI as arg, we assume DCI passed in might be just a Name if DCI was missing on product.

            const cleanTerm = dci.replace(/[^\w\s]/gi, '');
            const words = cleanTerm.split(/\s+/).filter(w => w.length > 3).slice(0, 2); // Take first 2 big words

            if (words.length > 0) {
                const conditions = words.map((_, i) => `name ILIKE $${i + 2}`).join(' AND ');
                const params = [currentId, ...words.map(w => `%${w}%`)];

                const fuzzySql = `
                    SELECT 
                        p.id::text as id,
                        p.name::text,
                        p.sku::text,
                        p.dci::text,
                        p.laboratory::text,
                        p.format::text,
                        p.units_per_box,
                        p.is_bioequivalent,
                        p.stock_actual as stock,
                        p.price_sell_box as price
                    FROM products p
                    WHERE 
                        p.id::text != $1
                        AND p.stock_actual > 0
                        AND (${conditions})
                    ORDER BY price ASC
                    LIMIT 10
                 `;
                result = await query(fuzzySql, params);
            }
        }

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            sku: row.sku || '',
            is_bioequivalent: row.is_bioequivalent || false,
            stock: Number(row.stock),
            price: Number(row.price),
            laboratory: row.laboratory || 'Generico',
            dci: row.dci || '',
            format: row.format || '',
            units_per_box: row.units_per_box || 1
        }));

    } catch (error) {
        console.error('❌ Error getting alternatives:', error);
        return [];
    }
}
