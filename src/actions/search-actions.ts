'use server';

import { pool } from '@/lib/db';
import { z } from 'zod';

const SearchSchema = z.string().min(2, "Mínimo 2 caracteres");

export interface ProductSearchResult {
    id: string;
    sku: string;
    name: string;
    barcode?: string;
    stock_actual: number;
    price: number;
    match_type: 'SKU' | 'NAME' | 'BARCODE';
}

/**
 * 🔍 Search Products Securely
 * Searches by SKU (exact/partial), Barcode (exact), and Name (fuzzy/ilike)
 */
export async function searchProductsSecure(term: string): Promise<{
    success: boolean;
    data?: ProductSearchResult[];
    error?: string;
}> {
    const validated = SearchSchema.safeParse(term);
    if (!validated.success) {
        return { success: false, data: [] }; // Return empty for short queries
    }

    const query = validated.data.trim();
    // Using simple ILIKE for broad compatibility. 
    // Ideally use pg_trgm but keeping it dependency-free for now.
    const searchPattern = `%${query}%`;

    try {
        const res = await pool.query(`
            SELECT 
                p.id, p.sku, p.name, 
                ib.barcode, 
                COALESCE(SUM(ib.quantity_real), 0) as stock_actual,
                p.price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id = ib.product_id
            WHERE 
                p.sku ILIKE $1 
                OR p.name ILIKE $1 
                OR ib.barcode = $2
            GROUP BY p.id, p.sku, p.name, ib.barcode, p.price
            LIMIT 10
        `, [searchPattern, query]);

        const results: ProductSearchResult[] = res.rows.map((row: any) => ({
            id: row.id,
            sku: row.sku,
            name: row.name,
            barcode: row.barcode,
            stock_actual: Number(row.stock_actual),
            price: Number(row.price),
            match_type: row.sku.toLowerCase() === query.toLowerCase() ? 'SKU' : 'NAME'
        }));

        return { success: true, data: results };

    } catch (error: any) {
        console.error('[SEARCH] Error searching products:', error);
        return { success: false, error: 'Error en búsqueda' };
    }
}

export interface ProductForEditResult {
    batch_id: string;
    sku: string;
    name: string;
    price: number;
    stock: number;
}

/**
 * 🔍 Busca productos por ubicación para usar en la edición de ventas.
 * Retorna el batch_id específico de la sucursal para que el ajuste
 * de inventario se aplique al lote correcto.
 */
export async function searchProductsForEditSecure(
    term: string,
    locationId: string,
): Promise<{ success: boolean; data?: ProductForEditResult[]; error?: string }> {
    const termValidation = SearchSchema.safeParse(term);
    if (!termValidation.success) {
        return { success: true, data: [] };
    }

    if (!locationId) {
        return { success: false, error: 'Se requiere locationId' };
    }

    const searchTerm = termValidation.data.trim();
    const searchPattern = `%${searchTerm}%`;

    try {
        const res = await pool.query(`
            SELECT
                ib.id          AS batch_id,
                p.sku,
                p.name,
                COALESCE(ib.unit_price, p.price, 0) AS price,
                ib.quantity_real                     AS stock
            FROM inventory_batches ib
            JOIN products p ON p.id = ib.product_id
            WHERE ib.location_id = $1::uuid
              AND (
                  p.name ILIKE $2
                  OR p.sku  ILIKE $2
                  OR ib.barcode = $3
              )
            ORDER BY ib.quantity_real DESC, p.name ASC
            LIMIT 15
        `, [locationId, searchPattern, searchTerm]);

        const data: ProductForEditResult[] = res.rows.map((row: any) => ({
            batch_id: row.batch_id,
            sku: row.sku,
            name: row.name,
            price: Number(row.price),
            stock: Number(row.stock),
        }));

        return { success: true, data };

    } catch (error: any) {
        console.error('[SEARCH] Error searching products for edit:', error);
        return { success: false, error: 'Error en búsqueda de productos' };
    }
}
