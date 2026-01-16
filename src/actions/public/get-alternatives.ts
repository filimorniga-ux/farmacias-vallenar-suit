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

        const result = await query(sql, [dci, currentId]);

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
