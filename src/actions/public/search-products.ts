'use server';

import { query } from '@/lib/db';

export interface ProductResult {
    id: string;
    name: string;
    sku: string;
    is_bioequivalent: boolean;
    stock: number;
    price: number;
    location_name?: string; // Optional, added for UI compatibility if needed
    description?: string;
    format?: string;
    laboratory?: string;
    dci?: string;
}

export async function searchProductsAction(term: string) {
    if (!term || term.length < 3) return [];

    try {
        const sql = `
            SELECT 
                p.id, 
                p.name, 
                p.sku, 
                p.is_bioequivalent,
                p.laboratory,
                p.dci, -- Added DCI for comparisons
                COALESCE(SUM(ib.quantity_real), 0) as stock,
                COALESCE(MAX(ib.price_sell_box), MAX(p.price_sell_box), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text
            WHERE (
                p.name ILIKE $1 
                OR p.sku ILIKE $1
                OR ib.barcode = $2
            )
            GROUP BY p.id, p.name, p.sku, p.is_bioequivalent, p.price_sell_box, p.laboratory, p.dci
            LIMIT 20
        `;

        const result = await query(sql, [`%${term}%`, term]);

        console.log(`✅ [Search Action] Encontrados ${result.rows.length} productos`);

        return result.rows.map(row => ({
            id: row.id,
            name: row.name,
            sku: row.sku,
            is_bioequivalent: row.is_bioequivalent || false,
            stock: Number(row.stock),
            price: Number(row.price),
            laboratory: row.laboratory || '',
            dci: row.dci || '',
            location_name: 'Global'
        }));

    } catch (error) {
        console.error('❌ [Search Action] Error:', error);
        return [];
    }
}
