'use server';

import { query } from '@/lib/db';

export interface ProductResult {
    id: string;
    sku: string;
    name: string;
    description: string;
    price: number;
    stock: number;
    location_name: string;
    format: string;
}

export async function getProducts(term: string, locationId: string): Promise<ProductResult[]> {
    if (!term || term.trim().length === 0) return [];

    // Validar UUID para evitar errores de sintaxis SQL si locationId viene mal
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (locationId && !uuidRegex.test(locationId)) {
        console.error('Invalid Location ID:', locationId);
        return [];
    }

    try {
        const sql = `
            SELECT 
                p.id,
                p.sku,
                p.name,
                COALESCE(p.description, '') as description,
                COALESCE(p.format, 'Unidad') as format,
                l.name as location_name,
                COALESCE(SUM(ib.quantity_real), 0) as stock,
                COALESCE(MAX(ib.sale_price), MAX(p.price_sell_box), 0) as price
            FROM products p
            LEFT JOIN inventory_batches ib ON p.id::text = ib.product_id::text AND ib.location_id::text = $2
            LEFT JOIN locations l ON l.id::text = $2
            WHERE (
                p.name ILIKE $1 
                OR p.sku ILIKE $1
                OR ib.barcode = $3
            )
            GROUP BY p.id, p.sku, p.name, l.name, p.price_sell_box, p.description, p.format
            LIMIT 20
        `;

        // El término de búsqueda se usa para LIKE %term% y para match exacto (barcode)
        const result = await query(sql, [`%${term}%`, locationId, term]);

        return result.rows.map(row => ({
            id: row.id,
            sku: row.sku,
            name: row.name,
            description: row.description,
            format: row.format,
            price: Number(row.price),
            stock: Number(row.stock),
            location_name: row.location_name || 'Sucursal'
        }));

    } catch (error) {
        console.error('Error in getProducts:', error);
        return [];
    }
}
