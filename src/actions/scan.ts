'use server';

import { query } from '@/lib/db';

export interface ScanResult {
    id: string; // Batch ID
    sku: string;
    barcode?: string;
    name: string;
    price: number;
    stock: number;
    is_restricted: boolean;
}

/**
 * Scan Product Action
 * Optimized for speed (< 200ms)
 * @param code Barcode or SKU
 * @param locationId Current Location ID
 */
export async function scanProduct(code: string, locationId: string): Promise<{ success: boolean; data?: ScanResult; error?: string }> {
    try {
        const cleanCode = code.trim().toUpperCase();

        // One-shot optimized query
        const res = await query(`
            SELECT 
                id, 
                sku, 
                COALESCE(barcode, sku) as barcode,
                name,
                price_sell_box as price,
                stock_actual as stock,
                condition
            FROM inventory_batches
            WHERE 
                location_id = $1 
                AND (UPPER(sku) = $2 OR UPPER(barcode) = $2)
            LIMIT 1
        `, [locationId, cleanCode]);

        if (res.rows.length === 0) {
            return { success: false, error: 'Producto no encontrado' };
        }

        const row = res.rows[0];

        const result: ScanResult = {
            id: row.id,
            sku: row.sku,
            barcode: row.barcode,
            name: row.name,
            price: parseFloat(row.price),
            stock: row.stock,
            is_restricted: row.condition === 'R' || row.condition === 'RR'
        };

        return { success: true, data: result };

    } catch (error) {
        console.error('Scan Error:', error);
        return { success: false, error: 'Error de lectura' };
    }
}
