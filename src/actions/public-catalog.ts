'use server';

import { query } from '@/lib/db';

export interface PublicPriceInfo {
    id: string;
    sku: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    location_name: string;
    format: string;
}

export async function checkProductPrice(term: string, locationId: string): Promise<{ success: boolean; data?: PublicPriceInfo[]; error?: string }> {
    if (!term || term.length < 3) {
        return { success: false, error: 'Ingrese al menos 3 caracteres.' };
    }

    if (!locationId) {
        return { success: false, error: 'Seleccione una sucursal.' };
    }

    try {
        // Query Logic:
        // 1. Search in PRODUCTS table by Name, SKU, or Barcode
        // 2. JOIN with INVENTORY_BATCHES to get stock specifically for the requested Location
        // 3. SUM stock (in case of multiple batches)
        // 4. MAX price (usually price is consistent, but safeguard)

        // Note: We use LEFT JOIN to show product even if out of stock, 
        // BUT strict requirement is "price/stock per branch". 
        // If no inventory record exists for that branch, stock is 0.

        const sql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                '' as description,
                '' as format,
                l.name as location_name,
                COALESCE(SUM(ib.quantity_real), 0) as total_stock,
                COALESCE(MAX(ib.sale_price), MAX(p.price_sell_box), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text AND ib.location_id::text = $2
            LEFT JOIN locations l ON l.id::text = $2
            WHERE (
                p.name ILIKE $1 
                OR p.sku ILIKE $1
                OR ib.barcode = $3
            )
            GROUP BY p.id, p.sku, p.name, l.name, p.price_sell_box
            LIMIT 20
        `;

        const result = await query(sql, [`%${term}%`, locationId, term]);

        const products: PublicPriceInfo[] = result.rows.map(row => ({
            id: row.id,
            sku: row.sku,
            name: row.name,
            description: row.description || '',
            format: row.format || 'Unidad',
            price: Number(row.price),
            stock: Number(row.total_stock),
            location_name: row.location_name || 'Sucursal Seleccionada'
        }));

        return { success: true, data: products };

    } catch (error: any) {
        console.error('Error checking prices:', error);
        return { success: false, error: 'Error al consultar precios.' };
    }
}
