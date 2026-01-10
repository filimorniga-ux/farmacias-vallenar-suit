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
                MIN(id::text) as id,
                raw_title as name,
                MAX(raw_sku) as sku,
                MAX(raw_active_principle) as dci,
                MAX(raw_misc->>'laboratorio') as laboratory,
                MAX(raw_misc->>'formato') as format,
                BOOL_OR(
                    (raw_misc->>'bioequivalente') IS NOT NULL 
                    OR (raw_misc->>'bioequivalencia') IS NOT NULL 
                    OR raw_title ILIKE '%BIOEQUIVALENTE%'
                ) as is_bioequivalent,
                SUM(raw_stock) as stock,
                MAX(raw_price) as price
            FROM inventory_imports
            WHERE 
                raw_active_principle ILIKE $1 
                AND id::text != $2
                AND raw_stock > 0 -- Only show alternatives with stock
            GROUP BY raw_title, raw_active_principle
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
            format: row.format || ''
        }));

    } catch (error) {
        console.error('❌ Error getting alternatives:', error);
        return [];
    }
}
